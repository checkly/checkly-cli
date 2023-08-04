import axios from 'axios'
import * as chalk from 'chalk'
import * as prompts from 'prompts'
import { Command, Flags } from '@oclif/core'
import { getUserGreeting, header, footer, hint } from '../utils/messages.js'
import { hasPackageJsonFile } from '../utils/directory'
import {
  createProject,
  getProjectDirectory,
  installDependenciesAndInitGit,
  installWithinProject,
} from '../utils/installation'

/**
 * This code is heavily inspired by the amazing create-astro package over at
 * https://github.com/withastro/astro/tree/main/packages/create-astro
 */

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

    const onCancel = (): void => {
      this.error(chalk.dim('Bailing, hope to see you again soon!\n'))
    }

    // This overrides the template prompt and skips to the next prompt
    if (template) {
      prompts.override({ template })
    }

    // This overrides prompts answers/selections (used on E2E tests)
    if (process.env.CHECKLY_E2E_PROMPTS_INJECTIONS) {
      try {
        const injections = JSON.parse(process.env.CHECKLY_E2E_PROMPTS_INJECTIONS)
        prompts.inject(injections)
      } catch {
        process.stderr.write('Error parsing CHECKLY_E2E_PROMPTS_INJECTIONS environment variable for injections.')
      }
    }

    let version = process.env.CHECKLY_CLI_VERSION ?? this.config.version

    // use latest version from NPM if it's running from the local environment or E2E
    if (version === '0.0.1-dev') {
      try {
        const { data: packageInformation } = await axios.get('https://registry.npmjs.org/checkly/latest')
        this.log(`\nNotice: replacing version '${version}' with latest '${packageInformation.version}'.\n`)
        version = packageInformation.version
      } catch { }
    }

    const greeting = await getUserGreeting()

    await header(version, greeting)

    const projectDirectory = await getProjectDirectory({ onCancel })

    if (hasPackageJsonFile(projectDirectory)) {
      // Init Checkly CLI for an existing project
      await installWithinProject({ projectDirectory, version, onCancel })
    } else {
      // Create a project from the scratch using a template
      await hint('Cool.', `Your project will be created in the directory "${projectDirectory}"`)
      await createProject({ projectDirectory, version, onCancel })
    }

    // ask and install dependencies and initialize git
    await installDependenciesAndInitGit({ projectDirectory })

    await footer(projectDirectory)
  }
}
