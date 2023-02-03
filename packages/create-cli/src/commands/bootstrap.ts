import Debug from 'debug'
import { Command, Flags } from '@oclif/core'
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator'
import prompts from 'prompts'
import { downloadTemplate } from 'giget'
import { execa, execaCommand } from 'execa'
import detectPackageManager from 'which-pm-runs'
import chalk from 'chalk'
import { isValidProjectDirectory, hasGitDir } from '../utils/directory.js'
import { spinner } from '../utils/terminal.js'
import {
  getUserGreeting,
  getVersion,
  header,
  bail,
  hint,
  footer,
} from '../utils/messages.js'

/**
 * This code is heavily inspired by the amazing create-astro package over at
 * https://github.com/withastro/astro/tree/main/packages/create-astro
 */

const debug = Debug('checkly:create-cli')
const templateBaseRepo = 'checkly/checkly-cli/examples'

function generateProjectName (): string {
  return uniqueNamesGenerator({
    dictionaries: [colors, animals],
    separator: '-',
    length: 2,
    style: 'lowerCase',
  })
}

function onCancel (): void {
  bail()
  process.exit(1)
}

export default class Bootstrap extends Command {
  static description = 'Bootstrap a Checkly project'

  static flags = {
    template: Flags.string({
      char: 't',
      description: 'An optional template name',
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Bootstrap)
    const { template } = flags

    // This overrides the template prompt and skips to the next prompt
    if (template) {
      prompts.override({ template })
    }

    const [version, greeting] = await Promise.all([getVersion(), getUserGreeting()])

    await header(version, greeting)

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
    },
    { onCancel },
    )

    const targetDir = projectDirResponse.projectDirectory

    if (!targetDir) {
      process.exit(1)
    }

    await hint('Cool.', `Your project will be created in the directory "${targetDir}"`)

    const templateResponse = await prompts({
      type: 'select',
      name: 'template',
      message: 'Which template would you like to use for your new project',
      choices: [
        { value: 'advanced-project', title: 'An advanced project with multiple examples and best practices (recommended)' },
        { value: 'boilerplate-project', title: 'A boilerplate project with basic config' },
      ],
    },
    { onCancel },
    )


    debug('Downloading template')

    const downloadTemplateSpinner = spinner('Downloading example template...')
    const templatePath = `${templateBaseRepo}/${templateResponse.template}`
    try {
      debug(`Attempting download of template: ${templatePath}`)
      await downloadTemplate(templatePath, {
        force: true,
        provider: 'github',
        cwd: targetDir,
        dir: '.',
      })
    } catch (e: any) {
      if (e.message.includes('404')) {
        downloadTemplateSpinner.text = chalk.red(`Couldn't find template "${templateResponse.template}"`)
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
      await hint('No worries.', 'Just remember to install the dependencies after this setup')
    }
    const initGitResponse = await prompts({
      type: 'confirm',
      name: 'initGit',
      message: 'Would you like to initialize a new git repo? (optional)',
      initial: true,
    })

    if (initGitResponse.initGit) {
      if (hasGitDir()) {
        await hint('Oh wait!', 'A .git directory already exists. Skipping...')
      } else {
        await execaCommand('git init', { cwd: targetDir })
      }
    }
    await footer(targetDir)
  }
}
