import { Args, Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import {
  formatTestSessionDetail,
  formatTestSessionErrorGroupDetail,
  uniqueErrorGroupIds,
} from '../../formatters/test-sessions.js'
import { type OutputFormat } from '../../formatters/render.js'

export default class TestSessionsGet extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Get details of a recorded test session, including result error groups for RCA.'

  static args = {
    id: Args.string({
      description: 'The ID of the test session to retrieve.',
      required: true,
    }),
  }

  static flags = {
    'error-group': Flags.string({
      description: 'Show details for a test session error group ID from this session.',
    }),
    'error-groups-limit': Flags.integer({
      description: 'Number of error group IDs to show in the session summary.',
      default: 5,
    }),
    'full-error': Flags.boolean({
      description: 'Print the complete raw error when showing a test session error group.',
      default: false,
    }),
    'output': outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(TestSessionsGet)
    this.style.outputFormat = flags.output

    try {
      const { data: testSession } = await api.testSessions.get(args.id)

      if (flags['error-group']) {
        const errorGroupIds = uniqueErrorGroupIds(testSession)

        if (!errorGroupIds.includes(flags['error-group'])) {
          const listCommand = `checkly test-sessions get ${args.id} `
            + `--error-groups-limit ${Math.max(5, errorGroupIds.length)}`
          this.style.longError(
            'Test session error group not found in this session.',
            `Run \`${listCommand}\` to list the available error group IDs.`,
          )
          process.exitCode = 1
          return
        }

        const { data: errorGroup } = await api.testSessionErrorGroups.get(flags['error-group'])

        if (flags.output === 'json') {
          this.log(JSON.stringify(errorGroup, null, 2))
          return
        }

        const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
        this.log(formatTestSessionErrorGroupDetail(errorGroup, fmt, {
          fullError: flags['full-error'],
        }))
        return
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(testSession, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      this.log(formatTestSessionDetail(testSession, fmt, {
        errorGroupsLimit: flags['error-groups-limit'],
      }))
    } catch (err: any) {
      this.style.longError('Failed to get test session details.', err)
      process.exitCode = 1
    }
  }
}
