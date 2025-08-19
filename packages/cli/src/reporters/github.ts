import * as fs from 'fs'
import * as path from 'path'

import AbstractListReporter, { checkFilesMap } from './abstract-list'
import { SequenceId } from '../services/abstract-check-runner'
import { CheckStatus, formatDuration, getTestSessionUrl, printLn, resultToCheckStatus } from './util'
import commonMessages from '../messages/common-messages'

const outputFile = './checkly-github-report.md'

type GithubMdBuilderOptions = {
  testSessionId?: string
  numChecks: number
  runLocation: string
  checkFilesMap: checkFilesMap
}

function nonNullable<T> (value: T): value is NonNullable<T> {
  return value !== null && value !== undefined
}

export class GithubMdBuilder {
  testSessionId?: string
  numChecks: number
  runLocation: string
  checkFilesMap: checkFilesMap
  subHeader: Array<string>
  tableHeaders: Array<string>
  extraTableHeadersWithLinks: Array<string>
  tableRows: Array<string> = []
  hasFilenames: boolean

  readonly header: string = '# Checkly Test Session Summary'
  readonly tableSeparatorFiller: string = '|:-'
  readonly tableSeparator: string = '|'
  constructor (options: GithubMdBuilderOptions) {
    this.testSessionId = options.testSessionId
    this.numChecks = options.numChecks
    this.runLocation = options.runLocation
    this.checkFilesMap = options.checkFilesMap

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

    if (this.testSessionId) {
      this.subHeader.push(`[View detailed test session summary](${getTestSessionUrl(this.testSessionId)})`)
    }

    if (this.testSessionId) {
      this.tableHeaders = this.tableHeaders.concat(this.extraTableHeadersWithLinks)
    }

    for (const [, checkMap] of this.checkFilesMap.entries()) {
      for (const [, { result, testResultId }] of checkMap.entries()) {
        const checkStatus = resultToCheckStatus(result)
        const tableRow: Array<string> = [
          `${checkStatus === CheckStatus.FAILED ? '❌ Fail' : checkStatus === CheckStatus.DEGRADED ? '⚠️ Degraded' : '✅ Pass'}`,
          `${result.name}`,
          `${result.checkType}`,
          this.hasFilenames ? `\`${result.sourceFile}\`` : undefined,
          `${formatDuration(result.responseTime)} `,
        ].filter(nonNullable)

        if (this.testSessionId && testResultId) {
          const linkColumn = `[Full test report](${getTestSessionUrl(this.testSessionId)}/results/${testResultId})`
          tableRow.push(linkColumn)
        }

        this.tableRows.push(this.tableSeparator + tableRow.join(this.tableSeparator) + this.tableSeparator)
      }
    }

    let markdown = this.header + '\n'
      + this.subHeader.join('\n') + '\n'
      + this.tableSeparator + this.tableHeaders.join('|') + this.tableSeparator + '\n'
      + this.tableSeparatorFiller.repeat(this.tableHeaders.length) + this.tableSeparator + '\n'
      + this.tableRows.sort((a, b) => a < b ? 1 : -1).join('\n') + '\n'

    if (!this.testSessionId) {
      markdown = markdown + `> Tip: ${commonMessages.inlineTips.useRecordFlag}`
    }

    return markdown
  }
}

export default class GithubReporter extends AbstractListReporter {
  onBegin (checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string) {
    super.onBegin(checks, testSessionId)
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2, 1)
  }

  onEnd () {
    this._printBriefSummary()
    const githubMdBuilder = new GithubMdBuilder({
      testSessionId: this.testSessionId,
      numChecks: this.numChecks!,
      runLocation: this._runLocationString(),
      checkFilesMap: this.checkFilesMap!,
    })

    const markDown = githubMdBuilder.render()

    const summaryFilename = process.env.CHECKLY_REPORTER_GITHUB_OUTPUT ?? outputFile
    fs.mkdirSync(path.resolve(path.dirname(summaryFilename)), { recursive: true })
    fs.writeFileSync(summaryFilename, markDown)

    printLn(`Github summary saved in '${path.resolve(summaryFilename)}'.`, 2)

    this._printTestSessionsUrl()
  }
}
