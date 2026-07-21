import { Flags } from '@oclif/core'

import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import {
  CheckSessionWaitTimeoutError,
  NoMatchingChecksError,
  type CheckSession,
  type CompletedCheckSession,
  type TriggerCheckSessionsRequest,
} from '../../rest/check-sessions.js'
import { formatCheckSessionsRun } from '../../formatters/check-sessions.js'
import type { OutputFormat } from '../../formatters/render.js'

const DEFAULT_TIMEOUT_SECONDS = 600
const COMPLETION_CONCURRENCY = 10

async function mapWithConcurrency<T, R> (
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await fn(items[index])
    }
  })

  await Promise.all(workers)
  return results
}

function hasFailed (session: CompletedCheckSession): boolean {
  return ['FAILED', 'TIMED_OUT', 'CANCELLED'].includes(session.status)
}

export default class ChecksRun extends AuthCommand {
  static hidden = false
  static readOnly = false
  static destructive = false
  static idempotent = false
  static description = 'Run deployed checks now using their configured locations and alerting rules.'

  static flags = {
    'tags': Flags.string({
      char: 't',
      description: 'Select checks using a comma-separated list of tags.'
        + ' Checks must contain all tags in one --tags filter.'
        + ' Repeat --tags to match any of multiple filters.',
      multiple: true,
    }),
    'check-id': Flags.string({
      description: 'Run specific checks by ID. Accepts comma-separated values and can be repeated.',
      multiple: true,
      delimiter: ',',
    }),
    'refresh-cache': Flags.boolean({
      description: 'Refresh the selected checks cache before running.',
      default: false,
    }),
    'timeout': Flags.integer({
      description: 'A timeout (in seconds) to wait for all check sessions to complete.',
      default: DEFAULT_TIMEOUT_SECONDS,
    }),
    'detach': Flags.boolean({
      char: 'd',
      description: 'Start the check sessions and exit without waiting for results.',
      default: false,
    }),
    'fail-on-no-matching': Flags.boolean({
      description: 'Exit with a failing status code when there are no matching checks. Enabled by default.',
      default: true,
      allowNo: true,
    }),
    'output': outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ChecksRun)
    this.style.outputFormat = flags.output

    if (flags.timeout < 1) {
      this.error('--timeout must be an integer greater than 0.')
    }

    const request: TriggerCheckSessionsRequest = {
      refreshCache: flags['refresh-cache'],
    }
    if (flags.tags || flags['check-id']) {
      request.target = {
        matchTags: flags.tags?.map(tags => tags.split(',')),
        checkId: flags['check-id'],
      }
    }

    let watching = false
    try {
      const response = await api.checkSessions.trigger(request)
      let sessions: CheckSession[] = response.sessions

      if (!flags.detach) {
        const deadlineAt = Date.now() + flags.timeout * 1_000
        const showAction = flags.output === 'table'
        let completedCount = 0

        if (showAction) {
          watching = true
          this.style.actionStart('Waiting for check sessions to complete...')
        }

        sessions = await mapWithConcurrency(response.sessions, COMPLETION_CONCURRENCY, async session => {
          const completed = await api.checkSessions.pollUntilComplete(session.checkSessionId, deadlineAt)
          completedCount++
          if (showAction) {
            this.style.actionStatus(`${completedCount}/${response.sessions.length}`)
          }
          return completed
        })

        if (showAction) {
          this.style.actionSuccess()
          watching = false
        }

        if ((sessions as CompletedCheckSession[]).some(hasFailed)) {
          process.exitCode = 1
        }
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify({ sessions }, null, 2))
        return
      }

      const format: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      this.log(formatCheckSessionsRun(sessions, format, { detached: flags.detach }))
    } catch (err: any) {
      if (watching) {
        this.style.actionFailure()
      }

      if (err instanceof NoMatchingChecksError) {
        this.log('No matching checks were found.')
        if (flags['fail-on-no-matching']) {
          process.exitCode = 1
        }
        return
      }

      if (err instanceof CheckSessionWaitTimeoutError) {
        this.style.longError(
          'Timed out waiting for check sessions.',
          `The check sessions are still running in Checkly. Increase --timeout or use --detach to exit after scheduling.`,
        )
        process.exitCode = 1
        return
      }

      this.style.longError('Failed to run checks.', err)
      process.exitCode = 1
    }
  }
}
