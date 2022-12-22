import * as api from '../rest/api'
import { prompt } from 'inquirer'
import { Command, Flags } from '@oclif/core'
import { parseProject } from '../services/project-parser'

export default class Deploy extends Command {
  static description = 'Deploy your changes'

  static flags = {
    preview: Flags.boolean({
      char: 'p',
      description: 'Show state preview',
      default: false,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Deploy)

    const project = await parseProject(process.cwd())

    const { confirm } = await prompt([{
      name: 'confirm',
      type: 'confirm',
      message: 'You are about to deploy your project. Do you want to continue?',
    }])
    if (!confirm) {
      return
    }

    try {
      await api.projects.deploy(project.synthesize())
    } catch (err: any) {
      if (err?.response?.status === 400) {
        console.error(`Failed to deploy the project due to a missing field. ${err.response.data.message}`)
      }
      throw err
    }
  }
}
