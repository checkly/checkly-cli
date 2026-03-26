import chalk from 'chalk'
import { Flags } from '@oclif/core'
import prompts from 'prompts'

import { BaseCommand } from './baseCommand'
import { detectCliMode } from '../helpers/cli-mode'
import {
  PLATFORM_TARGETS,
  readSkillFile,
  writeSkillToTarget,
} from './skills/install'
import {
  detectProjectContext,
  type ProjectContext,
  runSkillInstallStep,
  refreshSkill,
  runDepsInstall,
  createConfig,
  copyChecks,
  loadPromptTemplate,
  displayStarterPrompt,
  makeOnCancel,
  successMessage,
  greeting,
  footer,
  agentFooter,
  noSkillWarning,
  existingProjectFooter,
} from '../helpers/onboarding'

const VALID_TARGETS = Object.keys(PLATFORM_TARGETS)

export default class Init extends BaseCommand {
  static description = 'Initialize Checkly in your project'
  static examples = [
    '$ npx checkly init',
    '$ npx checkly init --target claude',
    '$ CI=true npx checkly init',
  ]

  static hidden = false
  static coreCommand = true
  static idempotent = true

  static flags = {
    target: Flags.string({
      char: 't',
      description: `Install the Checkly skill for a specific AI agent (${VALID_TARGETS.join(', ')}).`,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Init)
    const cliMode = detectCliMode()
    const projectDir = process.cwd()
    const context = detectProjectContext(projectDir)
    const log = (msg: string) => this.log(msg)

    // Handle --target flag: install skill non-interactively
    if (flags.target) {
      const targetDir = PLATFORM_TARGETS[flags.target]
      if (!targetDir) {
        this.error(
          `Unknown target "${flags.target}". `
          + `Available: ${VALID_TARGETS.join(', ')}`,
        )
      }
      try {
        const content = await readSkillFile()
        const targetPath = await writeSkillToTarget(
          targetDir, content,
        )
        log(successMessage(
          `Installed Checkly skill to ${targetPath}`,
        ))
      } catch (error: any) {
        log(chalk.red(
          `Could not install skill: ${error.message}`,
        ))
      }
    }

    if (!context.isExistingProject) {
      if (cliMode !== 'interactive') {
        this.log('No package.json found.')
        return
      }

      const { createPkg } = await prompts({
        type: 'confirm',
        name: 'createPkg',
        message: 'No package.json found. Create one?',
        initial: true,
      }, { onCancel: makeOnCancel(log) })

      if (!createPkg) {
        return
      }

      const { writeFileSync } = await import('fs')
      const { join, basename } = await import('path')
      const name = basename(projectDir)
      writeFileSync(
        join(projectDir, 'package.json'),
        JSON.stringify({
          name,
          version: '1.0.0',
          private: true,
        }, null, 2) + '\n',
      )
      log(successMessage('Created package.json'))

      // Re-detect now that package.json exists
      Object.assign(context, detectProjectContext(projectDir))
    }

    // === AGENT MODE ===
    if (cliMode === 'agent') {
      try {
        const noop = () => {}
        const skillResult = await runSkillInstallStep(noop)
        if (!context.hasChecklyConfig) {
          createConfig(projectDir, noop)
          await runDepsInstall(
            projectDir, noop, { skipPrompts: true },
          )
        }
        this.log(JSON.stringify({
          success: true,
          skillInstalled: skillResult.installed,
          skillPlatform: skillResult.platform,
          skillTargetPath: skillResult.targetPath,
          playwrightConfigDetected:
            context.hasPlaywrightConfig,
          playwrightConfigPath:
            context.playwrightConfigPath,
          hasChecklyConfig: context.hasChecklyConfig,
          hasChecksDir: context.hasChecksDir,
          hint: 'Run npx checkly skills for agent guidance',
        }))
      } catch (error: any) {
        this.log(JSON.stringify({
          success: false,
          error: error.message || String(error),
        }))
      }
      return
    }

    // === CI MODE ===
    if (cliMode === 'ci') {
      if (!context.hasChecklyConfig) {
        createConfig(projectDir, log)
        await runDepsInstall(
          projectDir, log, { skipPrompts: true },
        )
      }
      if (!flags.target) {
        log('\nTo install the AI agent skill, run:')
        log('  npx checkly skills install'
          + ' --target <agent> --force')
        log(`  Available: ${VALID_TARGETS.join(', ')}`)
      }
      return
    }

    // === INTERACTIVE MODE ===
    log(greeting(this.config.version))

    if (context.hasChecklyConfig) {
      await this.runExistingProjectFlow(
        projectDir, context, log,
      )
    } else {
      await this.runNewProjectFlow(
        projectDir, context, log,
      )
    }
  }

  // ─── NEW PROJECT ────────────────────────────────────────────

  private async runNewProjectFlow (
    projectDir: string,
    context: ProjectContext,
    log: (msg: string) => void,
  ): Promise<void> {
    const { wantAgent } = await prompts({
      type: 'confirm',
      name: 'wantAgent',
      message:
        'Do you want your AI agent to set up Checkly?',
      initial: true,
    }, { onCancel: makeOnCancel(log) })

    if (wantAgent) {
      await this.runAIPath(projectDir, context, log)
    } else {
      await this.runManualPath(projectDir, context, log)
    }
  }

  private async runAIPath (
    projectDir: string,
    context: ProjectContext,
    log: (msg: string) => void,
  ): Promise<void> {
    const skillResult = await runSkillInstallStep(log)

    // Always create config — the agent builds on it
    createConfig(projectDir, log)
    await runDepsInstall(projectDir, log)

    if (!skillResult.installed) {
      log(noSkillWarning())
    }

    const promptText = await this.loadStarterPrompt(
      projectDir, context,
    )
    await displayStarterPrompt(promptText, log)
    log(agentFooter(
      skillResult.platform,
      context.hasPlaywrightConfig,
    ))
  }

  private async runManualPath (
    projectDir: string,
    context: ProjectContext,
    log: (msg: string) => void,
  ): Promise<void> {
    // Config is mandatory
    createConfig(projectDir, log)

    const { wantExamples } = await prompts({
      type: 'confirm',
      name: 'wantExamples',
      message: 'Add some demo checks to get started?',
      initial: true,
    }, { onCancel: makeOnCancel(log) })

    if (wantExamples) {
      copyChecks(projectDir, log)
    }

    await runDepsInstall(projectDir, log)
    log(footer(context.hasPlaywrightConfig))
  }

  // ─── EXISTING PROJECT ───────────────────────────────────────

  private async runExistingProjectFlow (
    projectDir: string,
    context: ProjectContext,
    log: (msg: string) => void,
  ): Promise<void> {
    log(chalk.dim('  Checkly is already configured.\n'))

    if (context.hasSkillInstalled) {
      log(chalk.dim(
        '  Updating skill to the latest version...',
      ))
      const result = await refreshSkill(
        context.skillPath!, log,
      )
      if (result.installed) {
        log(successMessage(
          `Skill updated at ${result.targetPath}`,
        ))
      }
    } else {
      await runSkillInstallStep(log)
    }

    log(existingProjectFooter(context.hasPlaywrightConfig))
  }

  // ─── HELPERS ────────────────────────────────────────────────

  private loadStarterPrompt (
    projectDir: string,
    context: ProjectContext,
  ): Promise<string> {
    const templateName = context.hasPlaywrightConfig
      ? 'playwright'
      : 'base'

    const variables: Record<string, string> = {
      projectPath: projectDir,
    }
    if (context.playwrightConfigPath) {
      variables.playwrightConfigPath =
        context.playwrightConfigPath
    }
    return loadPromptTemplate(templateName, variables)
  }
}
