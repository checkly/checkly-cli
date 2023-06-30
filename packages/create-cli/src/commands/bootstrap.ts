import { Command, Flags } from '@oclif/core'
import prompts from 'prompts'
import {
  getUserGreeting,
  getVersion,
  header,
  bail,
  footer,
  hint,
} from '../utils/messages.js'
import { hasPackageJsonFile } from '../utils/directory.js'
import {
  createProject,
  getProjectDirectory,
  installDependenciesAndInitGit,
  installWithinProject,
} from '../utils/installation.js'
import path from 'path'

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
      bail()
      // TODO: replace this with oclif error()
      process.exit(1)
    }

    // This overrides the template prompt and skips to the next prompt
    if (template) {
      prompts.override({ template })
    }

    const [version, greeting] = await Promise.all([getVersion(), getUserGreeting()])

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
