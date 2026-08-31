import fs from 'node:fs'
import path from 'node:path'
import { execa } from 'execa'
import { spinner } from '../utils/terminal.js'
import { hint } from '../utils/messages.js'
import { PackageJson } from '../utils/directory.js'
import { askInstallDependencies } from '../utils/prompts.js'
import { getPackageManager } from '../utils/which-pm.js'

export function addDevDependecies (projectDirectory: string, packageJson: PackageJson) {
  if (!Reflect.has(packageJson, 'devDependencies')) {
    packageJson.devDependencies = {}
  }

  Object.assign(packageJson.devDependencies, {
    checkly: 'latest',
  })

  fs.writeFileSync(path.join(projectDirectory, 'package.json'), JSON.stringify(packageJson, null, 2))
}

/**
 * Returns false when an attempted dependency install failed. The bootstrap
 * continues either way — the scaffolded files are already on disk and usable —
 * but the caller can reflect the failure in the process exit code. Declining
 * the install is a user choice, not a failure.
 */
export async function installDependencies (targetDir: string): Promise<boolean> {
  const { installDependencies } = await askInstallDependencies()

  if (!installDependencies) {
    await hint('No worries.', 'Just remember to install the dependencies after this setup')
    return true
  }

  const packageManager = (await getPackageManager())?.name || 'npm'
  const installSpinner = spinner('Installing packages')
  try {
    // The execa call itself stays inside the try block: it can throw
    // synchronously (its Windows command escaping rejects arguments
    // containing line breaks) and that must not abort the bootstrap either.
    const installExec = execa(packageManager, ['install'], { cwd: targetDir })
    installExec.stdout?.on('data', function (data: any) {
      installSpinner.text = `installing \n${packageManager} ${data}`
    })
    await installExec
  } catch (error: any) {
    installSpinner.fail(`Failed to install packages${error?.shortMessage ? ` (${error.shortMessage})` : ''}`)
    await hint('Uh oh.', `You can continue the setup and install the dependencies yourself afterwards by running "${packageManager} install".`)
    return false
  }
  installSpinner.succeed('Packages installed successfully')
  return true
}
