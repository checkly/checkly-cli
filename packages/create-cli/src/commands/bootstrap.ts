import Debug from 'debug'
import { Command, Flags } from '@oclif/core'
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator'
import prompts from 'prompts'
import { execaCommand } from 'execa'
import chalk from 'chalk'
import { hasGitDir, isValidProjectDirectory, copyTemporaryFiles, usePackageName } from '../utils/directory.js'
import {
  getUserGreeting,
  getVersion,
  header,
  bail,
  hint,
  footer,
} from '../utils/messages.js'
import { createCustomBrowserCheck } from '../actions/creates.js'
import { addDevDependecies, installDependencies } from '../actions/dependencies.js'
import { hasPackageJsonFile, readPackageJson } from '../utils/package.js'
import { copyTemplate } from '../actions/template.js'

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

    // Init Checkly CLI for an existing project
    if (hasPackageJsonFile()) {
      debug('Existing package.json detected')

      const projectInitResponse = await prompts({
        type: 'confirm',
        name: 'useDirectory',
        message: 'It looks like you are already in a project, would you like to initialize?',
        initial: true,
      },
      { onCancel },
      )

      if (projectInitResponse.useDirectory) {
        const packageJson = readPackageJson()
        const temporaryDir = generateProjectName()

        debug('Add dependencies to existing package.json')
        addDevDependecies(packageJson)

        debug('Copy boilerplate project to temporary folder')
        await copyTemplate({
          template: 'boilerplate-project',
          templatePath: `${templateBaseRepo}/boilerplate-project`,
          targetDir: temporaryDir,
        })

        copyTemporaryFiles(temporaryDir)
        usePackageName(packageJson.name)

        debug('Create custom Browser check')
        await createCustomBrowserCheck({ onCancel })

        await installDependencies()

        await footer()

        return
      }
    }

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
    await copyTemplate({
      template: templateResponse.template,
      templatePath: `${templateBaseRepo}/${templateResponse.template}`,
      targetDir,
    })

    await installDependencies()

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
