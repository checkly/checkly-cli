import * as fs from 'fs'
import * as path from 'path'
import shell from 'shelljs'
import prompts from 'prompts'
import detectPackageManager from 'which-pm-runs'
import { execa } from 'execa'
import { spinner } from '../utils/terminal.js'
import { hint } from '../utils/messages.js'
import { PackageJson } from '../utils/package.js'

export function addDevDependecies (packageJson: PackageJson) {
  if (!Reflect.has(packageJson, 'devDependencies')) {
    packageJson.devDependencies = {}
  }

  Object.assign(packageJson.devDependencies, {
    checkly: 'latest',
    'ts-node': 'latest',
    typescript: 'latest',
  })

  fs.writeFileSync(path.join(shell.pwd(), 'package.json'), JSON.stringify(packageJson, null, 2))
}

export async function installDependencies (targetDir: string = shell.pwd()): Promise<void> {
  const installDepsResponse = await prompts({
    type: 'confirm',
    name: 'installDeps',
    message: 'Would you like to install NPM dependencies? (recommended)',
    initial: true,
  })

  if (installDepsResponse.installDeps) {
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
