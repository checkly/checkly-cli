import fs from 'node:fs'
import path from 'node:path'
import execa from 'execa'
import { spinner } from '../utils/terminal'
import { hint } from '../utils/messages'
import { PackageJson } from '../utils/directory'
import { askInstallDependencies } from '../utils/prompts'
import { getPackageManager } from '../utils/which-pm'

export function addDevDependecies (projectDirectory: string, packageJson: PackageJson) {
  if (!Reflect.has(packageJson, 'devDependencies')) {
    packageJson.devDependencies = {}
  }

  Object.assign(packageJson.devDependencies, {
    checkly: 'latest',
    jiti: '^2',
  })

  fs.writeFileSync(path.join(projectDirectory, 'package.json'), JSON.stringify(packageJson, null, 2))
}

export async function installDependencies (targetDir: string): Promise<void> {
  const { installDependencies } = await askInstallDependencies()

  if (installDependencies) {
    const packageManager = (await getPackageManager())?.name || 'npm'
    const installExec = execa(packageManager, ['install'], { cwd: targetDir })
    const installSpinner = spinner('Installing packages')
    await new Promise<void>((resolve, reject) => {
      installExec.stdout?.on('data', function (data: any) {
        installSpinner.text = `installing \n${packageManager} ${data}`
      })
      installExec.on('error', (error: any) => reject(error))
      installExec.on('close', () => resolve())
    })
    installSpinner.text = 'Packages installed successfully'
    installSpinner.succeed()
  } else {
    await hint('No worries.', 'Just remember to install the dependencies after this setup')
  }
}
