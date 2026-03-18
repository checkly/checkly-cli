import chalk from 'chalk'
import prompts from 'prompts'

import { BaseCommand } from './baseCommand'
import { detectCliMode } from '../helpers/cli-mode'
import {
  detectProjectContext,
  runSkillInstallStep,
  runDepsInstall,
  createConfig,
  copyChecks,
  loadPromptTemplate,
  displayStarterPrompt,
  greeting,
  footer,
  agentFooter,
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

  /**
   * Brand new project — full onboarding:
   * 1. Skill install (branch point)
   * 2a. Skill installed: show prompt, agent-first conclusion
   * 2b. Skill declined: config + demo checks + deps (each prompted), manual footer
   */
  private async runNewProjectFlow (
    projectDir: string,
    context: ReturnType<typeof detectProjectContext>,
    log: (msg: string) => void,
  ): Promise<void> {
    const skillResult = await runSkillInstallStep(log)

    if (skillResult.installed) {
      // Agent-enhanced path: prompt + agent-first conclusion
      const promptText = await this.loadStarterPrompt(projectDir, context)
      await displayStarterPrompt(promptText, log)
      log(agentFooter(skillResult.platform))
    } else {
      // Deterministic path — ask before creating files
      const { wantExamples } = await prompts({
        type: 'confirm',
        name: 'wantExamples',
        message: 'Create a Checkly config and some demo checks to get you started?',
        initial: true,
      }, { onCancel: onCancel(log) })

      if (wantExamples) {
        createConfig(projectDir, log)
        copyChecks(projectDir, log)
      }

      await runDepsInstall(projectDir, log)

      if (context.hasPlaywrightConfig) {
        log(playwrightHint())
      }

      log(footer())
    }
  }

  /**
   * Existing Checkly project — no boilerplate, no deps install:
   * - State 3 (has skill): refresh silently, agent-first conclusion
   * - State 2 (no skill): offer skill install, then appropriate conclusion
   */
  private async runExistingProjectFlow (
    projectDir: string,
    context: ReturnType<typeof detectProjectContext>,
    log: (msg: string) => void,
  ): Promise<void> {
    log(chalk.dim('  Checkly is already configured in this project.\n'))

    if (context.hasSkillInstalled) {
      // State 3: refresh skill silently, show agent-first conclusion
      log(chalk.dim('  Updating your Checkly skill to the latest version...'))
      const refreshResult = await this.silentSkillRefresh(log)

      if (refreshResult.installed) {
        log(chalk.green('✓') + ` Skill updated at ${refreshResult.targetPath}`)
      }

      // Derive platform from existing skill path
      const platform = this.platformFromSkillPath(context.skillPath)

      log('')
      log(chalk.green.bold('  You\'re all set!') + ' Here are some things you can do next:')
      log('')
      log(`  ${chalk.bold('npx checkly test --record')}  Run your checks locally`)
      log(`  ${chalk.bold('npx checkly deploy')}        Deploy checks to Checkly`)
      log(`  ${chalk.bold('npx checkly skills')}        View available agent actions`)
      if (platform) {
        log('')
        log(chalk.dim(`  Your ${platform} skill is up to date.`))
      }
      log('')
      log(chalk.dim('  Docs:  https://checklyhq.com/docs/cli'))
      log(chalk.dim('  Slack: https://checklyhq.com/slack'))
    } else {
      // State 2: offer skill install
      const skillResult = await runSkillInstallStep(log)

      if (skillResult.installed) {
        // They just installed the skill — show agent-first conclusion
        const promptText = await this.loadStarterPrompt(projectDir, context)
        await displayStarterPrompt(promptText, log)
        log(agentFooter(skillResult.platform))
      } else {
        // Declined skill — show manual next steps
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
    }
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

  private async silentSkillRefresh (
    log: (msg: string) => void,
  ): Promise<{ installed: boolean, targetPath: string | null }> {
    try {
      const context = detectProjectContext(process.cwd())

      if (!context.skillPath) {
        return { installed: false, targetPath: null }
      }

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

  /**
   * Derive a friendly platform name from the existing skill path.
   * e.g. ".claude/skills/checkly/SKILL.md" → "Claude Code"
   */
  private platformFromSkillPath (skillPath: string | null): string | null {
    if (!skillPath) return null
    if (skillPath.includes('.claude/')) return 'Claude Code'
    if (skillPath.includes('.cursor/')) return 'Cursor'
    if (skillPath.includes('.windsurf/')) return 'Windsurf'
    if (skillPath.includes('.goose/')) return 'Goose'
    if (skillPath.includes('.continue/')) return 'Continue'
    if (skillPath.includes('.roo/')) return 'Roo'
    if (skillPath.includes('.agents/')) return 'AI agent'
    return null
  }
}
