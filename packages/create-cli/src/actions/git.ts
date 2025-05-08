import fs from 'node:fs'
import path from 'node:path'
import { hasGitDir, hasGitIgnore } from '../utils/directory'
import execa from 'execa'
import { askInitializeGit } from '../utils/prompts'

export async function initGit (targetDir: string): Promise<void> {
  if (hasGitDir(targetDir)) {
    return
  }

  const { initializeGit } = await askInitializeGit()

  if (initializeGit) {
    await execa('git', ['init'], { cwd: targetDir })

    if (!hasGitIgnore(targetDir)) {
      const gitIgnore = 'node_modules\n.DS_Store'
      fs.writeFileSync(path.join(targetDir, '.gitignore'), gitIgnore)
    }
  }
}
