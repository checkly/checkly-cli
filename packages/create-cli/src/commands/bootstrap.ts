import { Command, Flags } from '@oclif/core'
import prompts from 'prompts'
import {
  getUserGreeting,
  getVersion,
  header,
  bail,
} from '../utils/messages.js'
import { hasPackageJsonFile } from '../utils/package.js'
import { createProject, installWithinProject } from '../utils/installation.js'

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

    // Init Checkly CLI for an existing project
    if (hasPackageJsonFile()) {
      await installWithinProject({ version, onCancel })
      return
    }

    createProject({ version, onCancel })
  }
}
