import * as fs from 'fs'
import prompts from 'prompts'
import { hasGitDir, hasGitIgnore } from '../utils/directory.js'
import path from 'path'
import { execaCommand } from 'execa'

export async function initGit (targetDir: string): Promise<void> {
  if (hasGitDir()) {
    return
  }

  const initGitResponse = await prompts({
    type: 'confirm',
    name: 'initGit',
    message: 'Would you like to initialize a new git repo? (optional)',
    initial: true,
  })

  if (initGitResponse.initGit) {
    await execaCommand('git init', { cwd: targetDir })

    if (!hasGitIgnore()) {
      const gitIgnore = 'node_modules\n.DS_Store'
      fs.writeFileSync(path.join(targetDir, './.gitignore'), gitIgnore)
    }
  }
}
