import * as fs from 'fs'
import * as path from 'path'
import detectPackageManager from 'which-pm-runs'
import { execa } from 'execa'
import { spinner } from '../utils/terminal.js'
import { hint } from '../utils/messages.js'
import { PackageJson } from '../utils/package.js'
import { askInstallDependencies } from '../utils/prompts.js'

export function addDevDependecies (packageJson: PackageJson) {
  if (!Reflect.has(packageJson, 'devDependencies')) {
    packageJson.devDependencies = {}
  }

  Object.assign(packageJson.devDependencies, {
    checkly: 'latest',
    'ts-node': 'latest',
    typescript: 'latest',
  })

  fs.writeFileSync(path.join(process.cwd(), 'package.json'), JSON.stringify(packageJson, null, 2))
}

export async function installDependencies (targetDir: string = process.cwd()): Promise<void> {
  const { installDependencies } = await askInstallDependencies()

  if (installDependencies) {
    const packageManager = detectPackageManager()?.name || 'npm'
    const installExec = execa(packageManager, ['install'], { cwd: targetDir })
    const installSpinner = spinner('installing packages')
    await new Promise<void>((resolve, reject) => {
      installExec.stdout?.on('data', function (data) {
        installSpinner.text = `installing \n${packageManager} ${data}`
      })
      installExec.on('error', (error) => reject(error))
      installExec.on('close', () => resolve())
    })
    installSpinner.text = 'Packages installed successfully'
    installSpinner.succeed()
  } else {
    await hint('No worries.', 'Just remember to install the dependencies after this setup')
  }
}
