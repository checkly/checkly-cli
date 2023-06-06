import * as fs from 'fs'
import * as path from 'path'
import shell from 'shelljs'
import prompts from 'prompts'
import { hasGitDir, hasGitIgnore } from '../utils/directory.js'
import { execaCommand } from 'execa'

export async function initGit (targetDir: string = shell.pwd().toString()): Promise<void> {
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
      fs.writeFileSync(path.join(targetDir, '.gitignore'), gitIgnore)
    }
  }
}
