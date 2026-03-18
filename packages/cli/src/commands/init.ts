import chalk from 'chalk'
import prompts from 'prompts'

import { BaseCommand } from './baseCommand'
import { detectCliMode } from '../helpers/cli-mode'
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
  greeting,
  footer,
  agentFooter,
  existingProjectFooter,
  playwrightHint,
} from '../helpers/onboarding'

export default class Init extends BaseCommand {
  static description = 'Initialize Checkly in your project'
  static examples = ['$ npx checkly init']
  static hidden = false
  static coreCommand = true
  static idempotent = true

  async run (): Promise<void> {
    const cliMode = detectCliMode()
    const projectDir = process.cwd()
    const context = detectProjectContext(projectDir)
    const log = (msg: string) => this.log(msg)

    if (!context.isExistingProject) {
      this.log('No package.json found. For new projects, use: npm create checkly@latest')
      return
    }

    // === AGENT MODE ===
    if (cliMode === 'agent') {
      try {
        const noop = () => {}
        const skillResult = await runSkillInstallStep(noop)
        if (!context.hasChecklyConfig) {
          createConfig(projectDir, noop)
          await runDepsInstall(projectDir, noop, { skipPrompts: true })
        }
        this.log(JSON.stringify({
          success: true,
          skillInstalled: skillResult.installed,
          skillPlatform: skillResult.platform,
          skillTargetPath: skillResult.targetPath,
          playwrightConfigDetected: context.hasPlaywrightConfig,
          playwrightConfigPath: context.playwrightConfigPath,
          hasChecklyConfig: context.hasChecklyConfig,
          hasChecksDir: context.hasChecksDir,
          hint: 'Run npx checkly skills for detailed agent guidance',
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
        await runDepsInstall(projectDir, log, { skipPrompts: true })
      }
      return
    }

    // === INTERACTIVE MODE ===
    log(greeting(this.config.version))

    if (context.hasChecklyConfig) {
      await this.runExistingProjectFlow(projectDir, context, log)
    } else {
      await this.runNewProjectFlow(projectDir, context, log)
    }
  }

  // ─── PRISTINE PROJECT ───────────────────────────────────────────────
  //
  // Skill installed → prompt (base or PW-aware) + agent footer
  // Skill declined  → demo checks? → config → deps → manual footer
  //
  private async runNewProjectFlow (
    projectDir: string,
    context: ProjectContext,
    log: (msg: string) => void,
  ): Promise<void> {
    const skillResult = await runSkillInstallStep(log)

    if (skillResult.installed) {
      const promptText = await this.loadStarterPrompt(projectDir, context, 'new')
      await displayStarterPrompt(promptText, log)
      log(agentFooter(skillResult.platform, context.hasPlaywrightConfig))
    } else {
      // Deterministic path
      const { wantExamples } = await prompts({
        type: 'confirm',
        name: 'wantExamples',
        message: 'Create a Checkly config and some demo checks to get you started?',
        initial: true,
      }, { onCancel: makeOnCancel(log) })

      if (wantExamples) {
        createConfig(projectDir, log)
        copyChecks(projectDir, log)
      }

      await runDepsInstall(projectDir, log)

      if (context.hasPlaywrightConfig) {
        log(playwrightHint())
      }

      log(footer(context.hasPlaywrightConfig))
    }
  }

  // ─── EXISTING CHECKLY PROJECT ───────────────────────────────────────
  //
  // Has skill    → refresh silently → concise next steps
  // No skill     → offer install
  //   Installed  → existing-project prompt + agent footer
  //   Declined   → concise next steps
  //
  // Never: boilerplate, demo checks, or deps install
  //
  private async runExistingProjectFlow (
    projectDir: string,
    context: ProjectContext,
    log: (msg: string) => void,
  ): Promise<void> {
    log(chalk.dim('  Checkly is already configured in this project.\n'))

    if (context.hasSkillInstalled) {
      // Refresh skill silently
      log(chalk.dim('  Updating your Checkly skill to the latest version...'))
      const refreshResult = await refreshSkill(context.skillPath!, log)

      if (refreshResult.installed) {
        log(chalk.green('✓') + ` Skill updated at ${refreshResult.targetPath}`)
      }

      log(existingProjectFooter())
    } else {
      // Offer skill install
      const skillResult = await runSkillInstallStep(log)

      if (skillResult.installed) {
        // Existing-project prompt (investigate, new checks, review changes)
        const promptText = await this.loadStarterPrompt(projectDir, context, 'existing')
        await displayStarterPrompt(promptText, log)
        log(agentFooter(skillResult.platform, context.hasPlaywrightConfig))
      } else {
        log(existingProjectFooter())
      }
    }
  }

  // ─── HELPERS ────────────────────────────────────────────────────────

  private loadStarterPrompt (
    projectDir: string,
    context: ProjectContext,
    projectState: 'new' | 'existing',
  ): Promise<string> {
    let templateName: string
    if (projectState === 'existing') {
      templateName = context.hasPlaywrightConfig ? 'existing-playwright' : 'existing'
    } else {
      templateName = context.hasPlaywrightConfig ? 'playwright' : 'base'
    }

    const variables: Record<string, string> = { projectPath: projectDir }
    if (context.playwrightConfigPath) {
      variables.playwrightConfigPath = context.playwrightConfigPath
    }
    return loadPromptTemplate(templateName, variables)
  }
}
