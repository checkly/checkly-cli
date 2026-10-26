import * as fs from 'fs'
import * as path from 'path'

import AbstractListReporter, { checkFilesMap } from './abstract-list.js'
import { SequenceId } from '../services/abstract-check-runner.js'
import { CheckStatus, formatDuration, formatRunError, getTestSessionUrl, printLn, printLnErr, resultToCheckStatus } from './util.js'

const outputFile = './checkly-github-report.md'

type GithubMdBuilderOptions = {
  testSessionId?: string
  numChecks: number
  runLocation: string
  checkFilesMap: checkFilesMap
  // Set to the limit when the run stopped early after that many failed checks.
  maxFailuresReached?: number
}

function nonNullable<T> (value: T): value is NonNullable<T> {
  return value !== null && value !== undefined
}

export class GithubMdBuilder {
  testSessionId?: string
  numChecks: number
  runLocation: string
  checkFilesMap: checkFilesMap
  maxFailuresReached?: number
  subHeader: Array<string>
  tableHeaders: Array<string>
  extraTableHeadersWithLinks: Array<string>
  tableRows: Array<string> = []
  executionErrors: Array<string> = []
  hasFilenames: boolean

  readonly header: string = '# Checkly Test Session Summary'
  readonly tableSeparatorFiller: string = '|:-'
  readonly tableSeparator: string = '|'
  constructor (options: GithubMdBuilderOptions) {
    this.testSessionId = options.testSessionId
    this.numChecks = options.numChecks
    this.runLocation = options.runLocation
    this.checkFilesMap = options.checkFilesMap
    this.maxFailuresReached = options.maxFailuresReached

    this.subHeader = []
    this.hasFilenames = !(options.checkFilesMap.size === 1 && options.checkFilesMap.has(undefined))
    this.tableHeaders = [
      'Result',
      'Name',
      'Check Type',
      this.hasFilenames ? 'Filename' : undefined,
      'Duration',
    ].filter(nonNullable)
    this.extraTableHeadersWithLinks = ['Link']
    this.tableRows = []
  }

  render (): string {
    this.subHeader.push(`Ran **${this.numChecks}** checks in **${this.runLocation}**.`)
    if (this.maxFailuresReached) {
      this.subHeader.push(`Stopped after **${this.maxFailuresReached}** failed `
        + `${this.maxFailuresReached === 1 ? 'check' : 'checks'} (max failures limit); `
        + 'checks that had not finished were not waited for.')
    }

    if (this.testSessionId) {
      this.subHeader.push(`[View detailed test session summary](${getTestSessionUrl(this.testSessionId)})`)
    }

    if (this.testSessionId) {
      this.tableHeaders = this.tableHeaders.concat(this.extraTableHeadersWithLinks)
    }

    for (const [, checkMap] of this.checkFilesMap.entries()) {
      for (const [, { check, result, testResultId, numRetries }] of checkMap.entries()) {
        const retries = numRetries ? ` (${numRetries} ${numRetries === 1 ? 'retry' : 'retries'})` : ''
        if (!result) {
          // Only a run that stopped early leaves checks without a result.
          this.tableRows.push(this.tableSeparator + [
            `⏹️ Not finished${retries}`,
            `${(check as any)?.name}`,
            // Checks fetched for `checkly trigger` carry their type; local constructs do not.
            `${(check as any)?.checkType ?? '-'}`,
            this.hasFilenames ? `\`${check?.getSourceFile?.()}\`` : undefined,
            '- ',
            this.testSessionId ? '' : undefined,
          ].filter(nonNullable).join(this.tableSeparator) + this.tableSeparator)
          continue
        }
        const checkStatus = resultToCheckStatus(result)
        const statusCell = checkStatus === CheckStatus.FAILED ? '❌ Fail' : checkStatus === CheckStatus.DEGRADED ? '⚠️ Degraded' : '✅ Pass'
        const tableRow: Array<string> = [
          `${statusCell}${retries}`,
          `${result.name}`,
          // A check that failed with a run error (e.g. the CLI timing out while waiting for
          // a result) has no check type or response time, so fall back to a placeholder.
          `${result.checkType ?? '-'}`,
          this.hasFilenames ? `\`${result.sourceFile}\`` : undefined,
          `${result.responseTime != null ? formatDuration(result.responseTime) : '-'} `,
        ].filter(nonNullable)

        if (this.testSessionId && testResultId) {
          const linkColumn = `[Full test report](${getTestSessionUrl(this.testSessionId)}/results/${testResultId})`
          tableRow.push(linkColumn)
        }

        this.tableRows.push(this.tableSeparator + tableRow.join(this.tableSeparator) + this.tableSeparator)

        if (result.runError) {
          this.executionErrors.push(`**${result.name}**\n\n\`\`\`\n${formatRunError(result.runError)}\n\`\`\``)
        }
      }
    }

    let markdown = this.header + '\n'
      + this.subHeader.join('\n') + '\n'
      + this.tableSeparator + this.tableHeaders.join('|') + this.tableSeparator + '\n'
      + this.tableSeparatorFiller.repeat(this.tableHeaders.length) + this.tableSeparator + '\n'
      + this.tableRows.sort((a, b) => a < b ? 1 : -1).join('\n') + '\n'

    if (this.executionErrors.length > 0) {
      markdown += '\n## Execution Errors\n\n'
        + 'These checks did not report a result to Checkly, so the test session may show a different status for them.\n\n'
        + this.executionErrors.join('\n\n') + '\n'
    }

    return markdown
  }
}

export default class GithubReporter extends AbstractListReporter {
  onBegin (checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string) {
    super.onBegin(checks, testSessionId)
    printLnErr(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2)
  }

  onEnd () {
    this._printBriefSummary()
    this._printExecutionErrors()
    const githubMdBuilder = new GithubMdBuilder({
      testSessionId: this.testSessionId,
      numChecks: this.numChecks!,
      runLocation: this._runLocationString(),
      checkFilesMap: this.checkFilesMap!,
      maxFailuresReached: this.maxFailuresReached,
    })

    const markDown = githubMdBuilder.render()

    const summaryFilename = process.env.CHECKLY_REPORTER_GITHUB_OUTPUT ?? outputFile
    fs.mkdirSync(path.resolve(path.dirname(summaryFilename)), { recursive: true })
    fs.writeFileSync(summaryFilename, markDown)

    printLn(`Github summary saved in '${path.resolve(summaryFilename)}'.`, 2)

    this._printTestSessionsUrl()
  }
}
