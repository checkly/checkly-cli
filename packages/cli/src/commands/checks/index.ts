import { Flags } from '@oclif/core'
import { checks } from '@checkly/public-api-client-preview'
import { AuthCommand } from '../authCommand'

export default class ChecksList extends AuthCommand {
  static hidden = false
  static description = 'List all checks in your account.'

  static flags = {
    limit: Flags.integer({
      char: 'l',
      description: 'Number of checks to return (1-100).',
      default: 25,
    }),
    page: Flags.integer({
      char: 'p',
      description: 'Page number.',
      default: 1,
    }),
    tag: Flags.string({
      char: 't',
      description: 'Filter by tag. Can be specified multiple times.',
      multiple: true,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ChecksList)

    const { data: checkList } = await checks.getV1Checks({
      limit: flags.limit,
      page: flags.page,
      tag: flags.tag,
    })

    if (checkList.length === 0) {
      this.log('No checks found.')
      return
    }

    this.log(JSON.stringify(checkList, null, 2))
  }
}
