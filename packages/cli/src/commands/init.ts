import chalk from 'chalk'
import prompts from 'prompts'

import { BaseCommand } from './baseCommand'
import { detectCliMode } from '../helpers/cli-mode'
import {
  detectProjectContext,
  runSkillInstallStep,
  runBoilerplateSetup,
  runDepsInstall,
  createConfig,
  copyChecks,
  loadPromptTemplate,
  displayStarterPrompt,
  greeting,
  footer,
  playwrightHint,
} from '../helpers/onboarding'
import { readSkillFile, writeSkillToTarget } from './skills/install'

const onCancel = (log: (msg: string) => void) => () => {
  log('\nSetup cancelled. Run npx checkly init anytime to try again.')
  process.exit(0)
}

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
        await runBoilerplateSetup(projectDir, log, { skipPrompts: true })
      }
      return
    }

    // === INTERACTIVE MODE ===
    log(greeting(this.config.version))

    if (context.hasChecklyConfig) {
      // ── STATE 2 or 3: Existing Checkly project ──
      await this.runExistingProjectFlow(projectDir, context, log)
    } else {
      // ── STATE 1: Brand new ──
      await this.runNewProjectFlow(projectDir, context, log)
      log(footer())
    }
  }

  /**
   * Brand new project — full onboarding:
   * 1. Skill install (branch point)
   * 2a. If skill installed: show AI prompt, optionally offer boilerplate + deps separately
   * 2b. If skill declined: config + boilerplate + deps (each prompted)
   */
  private async runNewProjectFlow (
    projectDir: string,
    context: ReturnType<typeof detectProjectContext>,
    log: (msg: string) => void,
  ): Promise<void> {
    const skillResult = await runSkillInstallStep(log)

    if (skillResult.installed) {
      // Agent-enhanced path: show starter prompt
      const promptText = await this.loadStarterPrompt(projectDir, context)
      await displayStarterPrompt(promptText, log)

      // Offer boilerplate separately
      const { wantBoilerplate } = await prompts({
        type: 'confirm',
        name: 'wantBoilerplate',
        message: 'Create example checks to see how Checkly works?',
        initial: true,
      }, { onCancel: onCancel(log) })

      if (wantBoilerplate) {
        createConfig(projectDir, log)
        copyChecks(projectDir, log)
      }

      // Offer deps separately
      await runDepsInstall(projectDir, log)
    } else {
      // Deterministic path — ask before creating files
      const { wantBoilerplate } = await prompts({
        type: 'confirm',
        name: 'wantBoilerplate',
        message: 'Create a Checkly config and example checks in your project?',
        initial: true,
      }, { onCancel: onCancel(log) })

      if (wantBoilerplate) {
        createConfig(projectDir, log)
        copyChecks(projectDir, log)
      }

      await runDepsInstall(projectDir, log)

      if (context.hasPlaywrightConfig) {
        log(playwrightHint())
      }
    }
  }

  /**
   * Existing Checkly project:
   * - If skill already installed: show AI prompt directly (refresh skill silently)
   * - If no skill: offer skill install, then AI prompt or just done
   * - No boilerplate (they already have checks)
   * - No fresh dep install (offer upgrade hint instead)
   */
  private async runExistingProjectFlow (
    projectDir: string,
    context: ReturnType<typeof detectProjectContext>,
    log: (msg: string) => void,
  ): Promise<void> {
    log(chalk.dim('  Checkly is already configured in this project.\n'))

    if (context.hasSkillInstalled) {
      // State 3: Has Checkly + has skill → refresh skill silently
      log(chalk.dim('  Updating your Checkly skill to the latest version...'))
      const skillResult = await this.silentSkillRefresh(log)

      if (skillResult.installed) {
        log(chalk.green('✓') + ` Skill updated at ${skillResult.targetPath}`)
      }
    } else {
      // State 2: Has Checkly, no skill → offer skill install
      await runSkillInstallStep(log)
    }

    // Suggest next steps for existing projects
    log('')
    log(chalk.green.bold('  You\'re all set!') + ' Here are some things you can do next:')
    log('')
    log(`  ${chalk.bold('npx checkly test --record')}  Run your checks locally`)
    log(`  ${chalk.bold('npx checkly deploy')}        Deploy checks to Checkly`)
    log(`  ${chalk.bold('npx checkly skills')}        View available agent actions`)
    log('')
    log(chalk.dim('  Docs:  https://checklyhq.com/docs/cli'))
    log(chalk.dim('  Slack: https://checklyhq.com/slack'))
  }

  private loadStarterPrompt (
    projectDir: string,
    context: ReturnType<typeof detectProjectContext>,
  ): Promise<string> {
    const templateName = context.hasPlaywrightConfig ? 'playwright' : 'base'
    const variables: Record<string, string> = { projectPath: projectDir }
    if (context.playwrightConfigPath) {
      variables.playwrightConfigPath = context.playwrightConfigPath
    }
    return loadPromptTemplate(templateName, variables)
  }

  /**
   * Silently refresh the skill file using the detected platform from the existing path.
   */
  private async silentSkillRefresh (
    log: (msg: string) => void,
  ): Promise<{ installed: boolean, targetPath: string | null }> {
    try {
      const context = detectProjectContext(process.cwd())

      if (!context.skillPath) {
        return { installed: false, targetPath: null }
      }

      // Extract the relative directory from the existing skill path
      const { dirname, relative } = await import('path')
      const targetDir = relative(process.cwd(), dirname(context.skillPath))
      const content = await readSkillFile()
      const targetPath = await writeSkillToTarget(targetDir, content)
      return { installed: true, targetPath }
    } catch {
      log(chalk.dim('  Could not update skill file.'))
      return { installed: false, targetPath: null }
    }
  }
}
