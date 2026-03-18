import { BaseCommand } from './baseCommand'
import { detectCliMode } from '../helpers/cli-mode'
import {
  detectProjectContext,
  runSkillInstallStep,
  runBoilerplateSetup,
  loadPromptTemplate,
  displayStarterPrompt,
  greeting,
  footer,
  playwrightHint,
} from '../helpers/onboarding'
import prompts from 'prompts'

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
      const skillResult = await runSkillInstallStep(log)
      await runBoilerplateSetup(projectDir, log, { skipPrompts: true, configOnly: true })
      this.log(JSON.stringify({
        success: true,
        skillInstalled: skillResult.installed,
        playwrightConfigDetected: context.hasPlaywrightConfig,
        playwrightConfigPath: context.playwrightConfigPath,
        hint: 'Run npx checkly skills for detailed agent guidance',
      }))
      return
    }

    // === INTERACTIVE MODE ===
    log(greeting(this.config.version))

    // Step 1: Skill installation (branch point)
    const skillResult = await runSkillInstallStep(log)

    if (skillResult.installed) {
      // Step 2a: Agent-enhanced path
      const templateName = context.hasPlaywrightConfig ? 'playwright' : 'base'
      const variables: Record<string, string> = { projectPath: projectDir }
      if (context.playwrightConfigPath) {
        variables.playwrightConfigPath = context.playwrightConfigPath
      }

      const promptText = await loadPromptTemplate(templateName, variables)
      await displayStarterPrompt(promptText, log)

      const { alsoBoilerplate } = await prompts({
        type: 'confirm',
        name: 'alsoBoilerplate',
        message: 'Would you also like us to create boilerplate checks and install dependencies?',
        initial: false,
      })

      if (alsoBoilerplate) {
        await runBoilerplateSetup(projectDir, log)
      }
    } else {
      // Step 2b: Deterministic path
      await runBoilerplateSetup(projectDir, log)

      if (context.hasPlaywrightConfig) {
        log(playwrightHint())
      }
    }

    // Step 3: Footer
    log(footer())
  }
}
