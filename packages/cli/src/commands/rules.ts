import { BaseCommand } from './baseCommand';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
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
    try {
      // Find AI IDE config folders
      const result = await this.findAIIDEConfigFolder();

      const { configPath, ideType } = result;
      this.log(`Found ${ideType?.rootFolder} config folder: ${configPath}`);

      // Read the base rules file
      const rulesContent = await this.readBaseRulesFile();

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

      // Check if file already exists and ask for confirmation
      const shouldOverwrite = await this.confirmOverwrite(targetPath);

      if (!shouldOverwrite) {
        this.log('Operation cancelled.');
        return;
      }

      // Save the rules file
      await writeFile(targetPath, rulesContent, 'utf8');

      this.log(`✅ Successfully saved Checkly rules file to: ${targetPath}`);
    } catch (error) {
      this.error(`Failed to generate rules file: ${error}`);
    }
  }

  private async findAIIDEConfigFolder() {
    let currentDir = process.cwd();

    while (true) {
      for (const ideConfig of Object.values(AI_IDE_CONFIGS)) {
        const configPath = join(currentDir, ideConfig.rootFolder);
        try {
          await access(configPath, constants.F_OK);
          return { ideType: ideConfig, configPath };
        } catch {
          // Folder doesn't exist, continue searching
        }
      }

      // Check if we've reached the root directory
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        // We've reached the root directory
        break;
      }

      // Move up one directory
      currentDir = parentDir;
    }

    return {
      configPath: process.cwd(),
      ideType: AI_IDE_CONFIGS.None,
    };
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
