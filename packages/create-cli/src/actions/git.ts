import * as fs from 'fs'
import prompts from 'prompts'
import { hasGitIgnore } from '../utils/directory.js'
import path from 'path'

export async function createGitIgnore (targetDir: string): Promise<void> {
  if (!hasGitIgnore()) {
    const initResponse = await prompts({
      type: 'confirm',
      name: 'initGitIgnore',
      message: 'Would you like to initialize a .gitignore file? (optional)',
      initial: true,
    })

    if (initResponse.initGitIgnore) {
      const gitIgnore = 'node_modules\n.DS_Store'
      fs.writeFileSync(path.join(targetDir, './.gitignore'), gitIgnore)
    }
  }
}
