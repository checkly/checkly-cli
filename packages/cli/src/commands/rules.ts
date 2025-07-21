import { BaseCommand } from './baseCommand';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';
import prompts from 'prompts';

const BASE_RULES_FILE_PATH = join(__dirname, '../rules/checkly.rules.md');

// AI IDE configurations mapping
const AI_IDE_CONFIGS = {
  Windsurf: {
    rootFolder: '.windsurf',
    rulesFolder: 'rules',
    rulesFileName: 'checkly.md',
  },
  'GitHub Copilot': {
    rootFolder: '.github/',
    rulesFolder: 'instructions',
    rulesFileName: 'checkly.instructions.md',
  },
  Cursor: {
    rootFolder: '.cursor',
    rulesFolder: 'rules',
    rulesFileName: 'checkly.mdc',
  },
  None: {
    rootFolder: 'None',
    rulesFolder: '',
    rulesFileName: 'checkly.md',
  },
} as const;

export default class Rules extends BaseCommand {
  static hidden = false;
  static description =
    'Generate a rules file to use with AI IDEs and Copilots.';

  async run(): Promise<void> {

    // Read the base rules file
    const rulesContent = await this.readBaseRulesFile();
    if (!rulesContent) {
      this.error(`Failed to read rules file at ${BASE_RULES_FILE_PATH}`);
    }

    // In non-interactive mode, print rules to stdout and exit
    const isNonInteractive = !process.stdin.isTTY || !process.stdout.isTTY || process.env.CI || process.env.CHECKLY_NON_INTERACTIVE;
    if (isNonInteractive) {
      this.log(rulesContent);
      return;
    }

    try {
      // Find AI IDE config folders
      const detectedConfigs = await this.findAIIDEConfigFolders();

      // Create options for multiselect - always include fallback option
      const choices = [
        ...detectedConfigs.map(config => ({
          title: `${(Object.keys(AI_IDE_CONFIGS) as Array<keyof typeof AI_IDE_CONFIGS>).find(key => AI_IDE_CONFIGS[key] === config.ideType)} (${config.configPath})`,
          value: config,
          selected: false, // Auto-select detected configs
        })),
        {
          title: 'Plain Markdown File (checkly.rules.md)',
          value: {
            ideType: AI_IDE_CONFIGS.None,
            configPath: process.cwd(),
          },
          selected: false, // Always selected by default
        },
      ];

      const isNonInteractive = !process.stdin.isTTY || !process.stdout.isTTY || process.env.CI || process.env.CHECKLY_NON_INTERACTIVE;

      // Interactive mode - show multiselect
      const { configs: selectedConfigs } = await prompts({
        type: 'multiselect',
        name: 'configs',
        message: 'Select the AI IDE configurations to generate rules for:',
        choices,
        min: 1, // Require at least one selection
      });

      if (!selectedConfigs || selectedConfigs.length === 0) {
        this.log('Operation cancelled.');
        return;
      }


      // Generate rules for each selected configuration
      for (const { ideType, configPath } of selectedConfigs) {
        try {
          this.log(`\nGenerating rules for ${ideType.rootFolder === 'None' ? 'fallback' : ideType.rootFolder}...`);

          // Create rules directory if it doesn't exist
          const rulesDir = join(configPath, ideType.rulesFolder);
          if (ideType.rulesFolder) {
            try {
              await mkdir(rulesDir, { recursive: true });
            } catch {
              // Directory might already exist, ignore error
            }
          }

          // Determine the target file path
          const targetPath = join(rulesDir || configPath, ideType.rulesFileName);

          // Check if file already exists and ask for confirmation (only in interactive mode)
          let shouldOverwrite = true;
          if (!isNonInteractive) {
            shouldOverwrite = await this.confirmOverwrite(targetPath);
          }

          if (!shouldOverwrite) {
            this.log(`Skipped ${targetPath}`);
            continue;
          }

          // Save the rules file
          await writeFile(targetPath, rulesContent, 'utf8');

          this.log(`✅ Successfully saved Checkly rules file to: ${targetPath}`);
        } catch (error) {
          this.error(`Failed to generate rules file for ${ideType.rootFolder}: ${error}`);
        }
      }
    } catch (error) {
      this.error(`Failed to generate rules file: ${error}`);
    }
  }

  private async findAIIDEConfigFolders() {
    const currentDir = process.cwd();

    const detectedAIIDEFolders = [];
    for (const ideConfig of Object.values(AI_IDE_CONFIGS)) {
      const configPath = join(currentDir, ideConfig.rootFolder);

      try {
        await access(configPath, constants.F_OK);
        detectedAIIDEFolders.push({ ideType: ideConfig, configPath });
      } catch {
        // Folder doesn't exist, continue searching
      }
    }

    return detectedAIIDEFolders;
  }

  private async readBaseRulesFile(): Promise<string> {
    try {
      return await readFile(BASE_RULES_FILE_PATH, 'utf8');
    } catch (error) {
      throw new Error(
        `Failed to read base rules file at ${BASE_RULES_FILE_PATH}: ${error}`
      );
    }
  }

  private async confirmOverwrite(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath, constants.F_OK);

      // File exists, ask for confirmation
      const { overwrite } = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `Rules file already exists at ${targetPath}. Do you want to overwrite it?`,
        initial: false,
      });

      return overwrite ?? false;
    } catch {
      // File doesn't exist, no need to confirm
      return true;
    }
  }
}
