import * as fs from 'fs'
import prompts from 'prompts'
import detectPackageManager from 'which-pm-runs'
import { execa } from 'execa'
import { spinner } from '../utils/terminal.js'
import { hint } from '../utils/messages.js'

interface PackageJson {
  name: string;
  devDependencies: {
    [key: string]: string;
  };
}

export function addDevDependecies (): PackageJson {
  const packageJson: PackageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))

  if (!Reflect.has(packageJson, 'devDependencies')) {
    packageJson.devDependencies = {}
  }

  Object.assign(packageJson.devDependencies, {
    '@checkly/cli': 'latest',
    'ts-node': 'latest',
    typescript: 'latest',
  })

  fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2))

  return packageJson
}

export async function installDependencies (): Promise<void> {
  const installDepsResponse = await prompts({
    type: 'confirm',
    name: 'installDeps',
    message: 'Would you like to install NPM dependencies? (recommended)',
    initial: true,
  })

  if (installDepsResponse.installDeps) {
    const packageManager = detectPackageManager()?.name || 'npm'
    const installExec = execa(packageManager, ['install'], { cwd: './' })
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
