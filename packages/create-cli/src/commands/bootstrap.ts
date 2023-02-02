import Debug from 'debug'
import { Command } from '@oclif/core'
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator'
import prompts from 'prompts'
import { downloadTemplate } from 'giget'
import { execa, execaCommand } from 'execa'
import detectPackageManager from 'which-pm-runs'
import { isValidProjectDirectory, hasGitDir } from '../utils/directory.js'
import { spinner } from '../utils/terminal.js'
import chalk from 'chalk'

/**
 * This code is heavily inspired by the amazing create-astro package over at
 * https://github.com/withastro/astro/tree/main/packages/create-astro
 */

const debug = Debug('checkly:create-cli')
const templateBaseRepo = 'checkly-cli/tree/main/examples/'

function generateProjectName (): string {
  return uniqueNamesGenerator({
    dictionaries: [colors, animals],
    separator: '-',
    length: 2,
    style: 'lowerCase',
  })
}

export default class Bootstrap extends Command {
  static description = 'Bootstrap a Checkly project'

  async run (): Promise<void> {
    debug('Ask for directory name')

    const projectDirResponse = await prompts({
      type: 'text',
      name: 'projectDirectory',
      message: 'Where do you want to create your new project?',
      initial: generateProjectName(),
      validate (dirName) {
        if (!isValidProjectDirectory(dirName)) {
          return `"${chalk.bold(dirName)}" is not empty!`
        }
        return true
      },
    })

    const targetDir = projectDirResponse.projectDirectory

    const projectTypeResponse = await prompts({
      type: 'select',
      name: 'template',
      message: 'How would you like to setup your new project?',
      choices: [
        { value: 'simple-project', title: 'A simple project with a set of best practices (recommended)' },
        { value: 'empty-project', title: 'An empty project with basic config' },
      ],
    })

    const { template } = projectTypeResponse

    const useTSResponse = await prompts({
      type: 'confirm',
      name: 'useTS',
      message: 'Would you like to use Typescript?',
    })

    const { useTS } = useTSResponse

    debug('Downloading template')

    const downloadTemplateSpinner = spinner('Downloading example template...')

    try {
      await downloadTemplate(`${templateBaseRepo}/${useTS ? 'ts' : 'js'}/${template}`, {
        force: true,
        provider: 'github',
        cwd: targetDir,
        dir: '.',
      })
    } catch (e: any) {
      if (e.message.includes('404')) {
        downloadTemplateSpinner.text = chalk.red(`Couldn't find template "${template}"`)
        downloadTemplateSpinner.fail()
      } else {
        console.error(e.message)
      }
      process.exit(1)
    }

    downloadTemplateSpinner.text = chalk.green('Example template copied!')
    downloadTemplateSpinner.succeed()

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
      this.log('No worries, just remember to install the dependencies after this setup')
    }

    const initGitResponse = await prompts({
      type: 'confirm',
      name: 'initGit',
      message: 'Would you like to initialize a new git repo? (optional)',
      initial: true,
    })

    if (initGitResponse.initGit) {
      if (hasGitDir()) {
        this.log('A .git directory already exists. Skipping...')
      } else {
        await execaCommand('git init', { cwd: targetDir })
      }
    }
  }
}
