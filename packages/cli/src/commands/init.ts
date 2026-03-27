import chalk from 'chalk'
import { Flags } from '@oclif/core'
import prompts from 'prompts'

import { BaseCommand } from './baseCommand'
import { detectCliMode, type CliMode } from '../helpers/cli-mode'
import {
  PLATFORM_TARGETS,
  readSkillFile,
  writeSkillToTarget,
} from './skills/install'
import {
  detectProjectContext,
  type ProjectContext,
  type SkillInstallResult,
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

function sanitizePackageName (name: string): string {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')

  return sanitized || 'checkly-project'
}

interface ExplicitSkillState {
  error: string | null
  result: SkillInstallResult | null
}

interface ProjectSetupResult {
  context: ProjectContext
  error: string | null
  ok: boolean
}

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
    const log = (msg: string) => this.log(msg)
    const explicitSkillState = await this.installExplicitTargetSkill(
      flags.target, log,
    )

    let context = detectProjectContext(projectDir)
    context = await this.ensureProjectPackageJson(
      projectDir, context, cliMode, log,
    ) ?? context

    if (!context.isExistingProject) {
      return
    }

    if (cliMode === 'agent') {
      await this.runAgentMode(
        projectDir, context, explicitSkillState,
      )
      return
    }

    if (cliMode === 'ci') {
      await this.runCiMode(
        projectDir,
        context,
        flags.target !== undefined,
        log,
      )
      return
    }

    log(greeting(this.config.version))

    if (context.hasChecklyConfig) {
      await this.runExistingProjectFlow(
        context, log, explicitSkillState.result,
      )
    } else {
      await this.runNewProjectFlow(
        projectDir, context, log, explicitSkillState.result,
      )
    }
  }

  // ─── NEW PROJECT ────────────────────────────────────────────

  private async runNewProjectFlow (
    projectDir: string,
    context: ProjectContext,
    log: (msg: string) => void,
    explicitSkillResult: SkillInstallResult | null,
  ): Promise<void> {
    const { wantAgent } = await prompts({
      type: 'confirm',
      name: 'wantAgent',
      message:
        'Do you want your AI agent to set up Checkly?',
      initial: true,
    }, { onCancel: makeOnCancel(log) })

    if (wantAgent) {
      await this.runAIPath(
        projectDir, context, log, explicitSkillResult,
      )
    } else {
      await this.runManualPath(projectDir, context, log)
    }
  }

  private async runAIPath (
    projectDir: string,
    context: ProjectContext,
    log: (msg: string) => void,
    explicitSkillResult: SkillInstallResult | null,
  ): Promise<void> {
    const skillResult = explicitSkillResult
      ?? await runSkillInstallStep(log)

    if (!skillResult.installed) {
      log(noSkillWarning())
    }

    const setupResult = await this.ensureProjectSetup(
      projectDir, context, log,
    )
    if (!setupResult.ok) {
      return
    }

    const promptText = await this.loadStarterPrompt(
      projectDir, context,
    )
    const copiedPrompt = await displayStarterPrompt(promptText, log)
    log(agentFooter(
      skillResult.platform,
      context.hasPlaywrightConfig,
      copiedPrompt,
    ))
  }

  private async runManualPath (
    projectDir: string,
    context: ProjectContext,
    log: (msg: string) => void,
  ): Promise<void> {
    const setupResult = await this.ensureProjectSetup(
      projectDir, context, log,
    )
    if (!setupResult.ok) {
      return
    }

    const { wantExamples } = await prompts({
      type: 'confirm',
      name: 'wantExamples',
      message: 'Add some demo checks to get started?',
      initial: true,
    }, { onCancel: makeOnCancel(log) })

    if (wantExamples) {
      copyChecks(projectDir, log)
    }

    log(footer(context.hasPlaywrightConfig))
  }

  // ─── EXISTING PROJECT ───────────────────────────────────────

  private async runExistingProjectFlow (
    context: ProjectContext,
    log: (msg: string) => void,
    explicitSkillResult: SkillInstallResult | null,
  ): Promise<void> {
    log(chalk.dim('  Checkly is already configured.\n'))

    if (explicitSkillResult?.installed) {
      log(existingProjectFooter(context.hasPlaywrightConfig))
      return
    }

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

  private async installExplicitTargetSkill (
    target: string | undefined,
    log: (msg: string) => void,
  ): Promise<ExplicitSkillState> {
    if (!target) {
      return { error: null, result: null }
    }

    const targetDir = PLATFORM_TARGETS[target]
    if (!targetDir) {
      this.error(
        `Unknown target "${target}". `
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
      return {
        error: null,
        result: {
          installed: true,
          platform: target,
          targetPath,
        },
      }
    } catch (error: any) {
      const message = error.message || String(error)
      log(chalk.red(
        `Could not install skill: ${message}`,
      ))
      return { error: message, result: null }
    }
  }

  private async ensureProjectPackageJson (
    projectDir: string,
    context: ProjectContext,
    cliMode: CliMode,
    log: (msg: string) => void,
  ): Promise<ProjectContext | null> {
    if (context.isExistingProject) {
      return context
    }

    if (cliMode !== 'interactive') {
      this.log('No package.json found.')
      return null
    }

    const { createPkg } = await prompts({
      type: 'confirm',
      name: 'createPkg',
      message: 'No package.json found. Create one?',
      initial: true,
    }, { onCancel: makeOnCancel(log) })

    if (!createPkg) {
      return null
    }

    await this.createPackageJson(projectDir, log)
    return detectProjectContext(projectDir)
  }

  private async createPackageJson (
    projectDir: string,
    log: (msg: string) => void,
  ): Promise<void> {
    const { writeFileSync } = await import('fs')
    const { join, basename } = await import('path')
    const name = sanitizePackageName(basename(projectDir))

    writeFileSync(
      join(projectDir, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        private: true,
      }, null, 2) + '\n',
    )
    log(successMessage('Created package.json'))
  }

  private async ensureProjectSetup (
    projectDir: string,
    context: ProjectContext,
    log: (msg: string) => void,
    skipPrompts: boolean = false,
  ): Promise<ProjectSetupResult> {
    if (context.hasChecklyConfig) {
      return { context, error: null, ok: true }
    }

    const configResult = createConfig(projectDir, log)
    if (!configResult.ok) {
      return {
        context,
        error: 'Could not create checkly.config.ts',
        ok: false,
      }
    }

    let nextContext = detectProjectContext(projectDir)

    const depsResult = await runDepsInstall(
      projectDir,
      log,
      skipPrompts ? { skipPrompts: true } : {},
    )
    nextContext = detectProjectContext(projectDir)
    if (!depsResult.ok) {
      return {
        context: nextContext,
        error: 'Could not install dependencies',
        ok: false,
      }
    }

    return { context: nextContext, error: null, ok: true }
  }

  private async runAgentMode (
    projectDir: string,
    context: ProjectContext,
    explicitSkillState: ExplicitSkillState,
  ): Promise<void> {
    try {
      const noop = () => {}
      const skillResult = explicitSkillState.result
        ?? await runSkillInstallStep(noop)
      const errors = explicitSkillState.error
        ? [explicitSkillState.error]
        : []
      const setupResult = await this.ensureProjectSetup(
        projectDir, context, noop, true,
      )

      if (!setupResult.ok && setupResult.error) {
        errors.push(setupResult.error)
      }

      if (errors.length > 0) {
        this.log(JSON.stringify({
          success: false,
          error: errors.join('; '),
        }))
        return
      }

      this.log(JSON.stringify({
        success: true,
        skillInstalled: skillResult.installed,
        skillPlatform: skillResult.platform,
        skillTargetPath: skillResult.targetPath,
        playwrightConfigDetected:
          setupResult.context.hasPlaywrightConfig,
        playwrightConfigPath:
          setupResult.context.playwrightConfigPath,
        hasChecklyConfig: setupResult.context.hasChecklyConfig,
        hasChecksDir: setupResult.context.hasChecksDir,
        hint: 'Run npx checkly skills for agent guidance',
      }))
    } catch (error: any) {
      this.log(JSON.stringify({
        success: false,
        error: error.message || String(error),
      }))
    }
  }

  private async runCiMode (
    projectDir: string,
    context: ProjectContext,
    hasTargetFlag: boolean,
    log: (msg: string) => void,
  ): Promise<void> {
    const setupResult = await this.ensureProjectSetup(
      projectDir, context, log, true,
    )
    if (!setupResult.ok) {
      return
    }

    if (!hasTargetFlag) {
      log('\nTo install the AI agent skill, run:')
      log('  npx checkly skills install'
        + ' --target <agent> --force')
      log(`  Available: ${VALID_TARGETS.join(', ')}`)
    }
  }
}
