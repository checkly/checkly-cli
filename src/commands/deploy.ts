import { Command, Flags } from '@oclif/core'

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

    this.log(`Running the deployment (preview=${flags.preview})`)
  }
}
