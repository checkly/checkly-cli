import { BaseCommand } from "./baseCommand";
import { readFile, writeFile, access } from "fs/promises";
import { join, dirname } from "path";
import { constants } from "fs";
import prompts from "prompts";

const BASE_RULES_FILE_PATH = join(__dirname, "../rules/checkly.rules.md");

// AI IDE config folder names to search for
const AI_IDE_CONFIGS = [
  ".windsurf",
  ".github/copilot", 
  ".cursor"
];

export default class Rules extends BaseCommand {
  static hidden = false;
  static description =
    "Generate a rules file to use with AI IDEs and code assistants.";

  async run(): Promise<void> {
    try {
      // Find AI IDE config folders
      const configFolder = await this.findAIIDEConfigFolder();
      
      if (!configFolder) {
        this.error(
          "No AI IDE config folders found. Please ensure you have one of the following folders in your project or parent directories:\n" +
          AI_IDE_CONFIGS.map(folder => `  - ${folder}`).join("\n")
        );
        return;
      }

      this.log(`Found AI IDE config folder: ${configFolder}`);

      // Read the base rules file
      const rulesContent = await this.readBaseRulesFile();
      
      // Determine the target file path
      const rulesFileName = "checkly.rules.md";
      const targetPath = join(configFolder, rulesFileName);

      // Check if file already exists and ask for confirmation
      const shouldOverwrite = await this.confirmOverwrite(targetPath);
      
      if (!shouldOverwrite) {
        this.log("Operation cancelled.");
        return;
      }

      // Save the rules file
      await writeFile(targetPath, rulesContent, "utf8");
      
      this.log(`✅ Successfully saved Checkly rules file to: ${targetPath}`);
      
    } catch (error) {
      this.error(`Failed to generate rules file: ${error}`);
    }
  }

  private async findAIIDEConfigFolder(): Promise<string | null> {
    let currentDir = process.cwd();
    const root = dirname(currentDir);

    while (currentDir !== root) {
      for (const configFolder of AI_IDE_CONFIGS) {
        const configPath = join(currentDir, configFolder);
        try {
          await access(configPath, constants.F_OK);
          return configPath;
        } catch {
          // Folder doesn't exist, continue searching
        }
      }
      
      // Move up one directory
      currentDir = dirname(currentDir);
    }

    // Check root directory as well
    for (const configFolder of AI_IDE_CONFIGS) {
      const configPath = join(root, configFolder);
      try {
        await access(configPath, constants.F_OK);
        return configPath;
      } catch {
        // Folder doesn't exist
      }
    }

    return null;
  }

  private async readBaseRulesFile(): Promise<string> {
    try {
      return await readFile(BASE_RULES_FILE_PATH, "utf8");
    } catch (error) {
      throw new Error(`Failed to read base rules file at ${BASE_RULES_FILE_PATH}: ${error}`);
    }
  }

  private async confirmOverwrite(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath, constants.F_OK);
      
      // File exists, ask for confirmation
      const { overwrite } = await prompts({
        type: "confirm",
        name: "overwrite",
        message: `Rules file already exists at ${targetPath}. Do you want to overwrite it?`,
        initial: false
      });

      return overwrite ?? false;
    } catch {
      // File doesn't exist, no need to confirm
      return true;
    }
  }
}
