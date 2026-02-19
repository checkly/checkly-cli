import { Args } from '@oclif/core'
import { checks } from '@checkly/public-api-client-preview'
import { AuthCommand } from '../authCommand'

export default class ChecksGet extends AuthCommand {
  static hidden = false
  static description = 'Get details of a specific check.'

  static args = {
    id: Args.string({
      description: 'The ID of the check to retrieve.',
      required: true,
    }),
  }

  async run (): Promise<void> {
    const { args } = await this.parse(ChecksGet)

    const { data: check } = await checks.getV1ChecksId(args.id)

    this.log(JSON.stringify(check, null, 2))
  }
}
