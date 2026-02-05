import { BaseCommand } from './baseCommand'
import { readFile, writeFile, access, mkdir } from 'fs/promises'
import path, { join } from 'path'
import { constants } from 'fs'
import prompts from 'prompts'

const BASE_RULES_FILE_PATH = join(__dirname, '../ai-context/checkly.rules.md')

// AI IDE configurations mapping
const AI_IDE_CONFIGS = {
  'Windsurf': {
    rulesFolder: '.windsurf/rules',
    rulesFileName: 'checkly.md',
  },
  'GitHub Copilot': {
    rulesFolder: '.github/instructions',
    rulesFileName: 'checkly.instructions.md',
  },
  'Cursor': {
    rulesFolder: '.cursor/rules',
    rulesFileName: 'checkly.mdc',
  },
  'Plain Markdown (checkly.md)': {
    rulesFolder: '.',
    rulesFileName: 'checkly.md',
  },
} as const

export default class Rules extends BaseCommand {
  static hidden = false
  static description =
    'Generate a rules file to use with AI IDEs and Copilots.'

  async run (): Promise<void> {
    // Read the base rules file
    const rulesContent = await this.readBaseRulesFile()
    if (!rulesContent) {
      this.error(`Failed to read rules file at ${BASE_RULES_FILE_PATH}`)
    }

    // In non-interactive mode, print rules to stdout and exit
    const isNonInteractive = !process.stdin.isTTY
      || !process.stdout.isTTY
      || process.env.CI
      || process.env.CHECKLY_NON_INTERACTIVE
    if (isNonInteractive) {
      this.log(rulesContent)
      return
    }

    try {
      // Create options for multiselect - offer all configs from AI_IDE_CONFIGS
      const choices = Object.entries(AI_IDE_CONFIGS).map(([ideName, ideConfig]) => {
        return {
          title: `${ideName} (${path.join(ideConfig.rulesFolder, ideConfig.rulesFileName)})`,
          value: ideConfig,
          selected: false,
        }
      })

      const isNonInteractive = !process.stdin.isTTY
        || !process.stdout.isTTY
        || process.env.CI
        || process.env.CHECKLY_NON_INTERACTIVE

      // Interactive mode - show multiselect
      const { configs: selectedConfig } = await prompts({
        type: 'select',
        name: 'configs',
        message: 'Select the AI IDE configurations to generate rules for:',
        choices,
        initial: 0,
      })

      if (!selectedConfig) {
        this.log('Operation cancelled.')
        return
      }

      this.log(`Generating rules`)

      // Create rules directory if it doesn't exist
      const rulesDir = join(process.cwd(), selectedConfig.rulesFolder)
      try {
        await mkdir(rulesDir, { recursive: true })
      } catch {
        // Directory might already exist, ignore error
      }

      // Determine the target file path
      const rulesFilePath = join(rulesDir, selectedConfig.rulesFileName)

      // Check if file already exists and ask for confirmation (only in interactive mode)
      let shouldOverwrite = true
      if (!isNonInteractive) {
        shouldOverwrite = await this.confirmOverwrite(rulesFilePath)
      }

      if (!shouldOverwrite) {
        this.log(`Skipped ${rulesFilePath}`)
        return
      }

      // Save the rules file
      await writeFile(rulesFilePath, rulesContent, 'utf8')

      this.log(`✅ Successfully saved Checkly rules file to: ${rulesFilePath}`)
    } catch (error) {
      this.error(`Failed to generate rules file: ${error}`)
    }
  }

  private async readBaseRulesFile (): Promise<string> {
    try {
      return await readFile(BASE_RULES_FILE_PATH, 'utf8')
    } catch (error) {
      throw new Error(
        `Failed to read base rules file at ${BASE_RULES_FILE_PATH}: ${error}`,
      )
    }
  }

  private async confirmOverwrite (targetPath: string): Promise<boolean> {
    try {
      await access(targetPath, constants.F_OK)

      // File exists, ask for confirmation
      const { overwrite } = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `Rules file already exists at ${targetPath}. Do you want to overwrite it?`,
        initial: false,
      })

      return overwrite ?? false
    } catch {
      // File doesn't exist, no need to confirm
      return true
    }
  }
}
