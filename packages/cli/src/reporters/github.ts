import * as fs from 'fs'
import * as path from 'path'

import AbstractListReporter, { checkFilesMap } from './abstract-list'
import { formatDuration, printLn, getTestSessionUrl, getTraceUrl } from './util'

const outputFile = './checkly-github-report.md'

type GithubMdBuilderOptions = {
  testSessionId?: string
  testResultIds?: { [key: string]: string }
  numChecks: number
  runLocation: string
  checkFilesMap: checkFilesMap
}

export class GithubMdBuilder {
  testSessionId?: string
  testResultIds?: { [key: string]: string }
  numChecks: number
  runLocation: string
  checkFilesMap: checkFilesMap
  subHeader: Array<string>
  tableHeaders: Array<string>
  extraTableHeadersWithLinks: Array<string>
  tableRows: Array<string> = []

  readonly header: string = '# Checkly Test Session Summary'
  readonly tableSeparatorFiller: string = '|:-'
  readonly tableSeparator: string = '|'
  constructor (options: GithubMdBuilderOptions) {
    this.testSessionId = options.testSessionId
    this.testResultIds = options.testResultIds
    this.numChecks = options.numChecks
    this.runLocation = options.runLocation
    this.checkFilesMap = options.checkFilesMap

    this.subHeader = []
    this.tableHeaders = ['Result', 'Name', 'Check Type', 'Filename', 'Duration']
    this.extraTableHeadersWithLinks = ['Assets', 'Link']
    this.tableRows = []
  }

  render (): string {
    this.subHeader.push(`Ran **${this.numChecks}** checks in **${this.runLocation}**.`)

    if (this.testSessionId) {
      this.subHeader.push(`[View detailed test session summary](${getTestSessionUrl(this.testSessionId)})`)
    }

    if (this.testSessionId && this.testResultIds) {
      this.tableHeaders = this.tableHeaders.concat(this.extraTableHeadersWithLinks)
    }

    for (const [_, checkMap] of this.checkFilesMap.entries()) {
      for (const [_, { check, result }] of checkMap.entries()) {
        const tableRow: Array<string> = [
          `${result.hasFailures ? '❌ Fail' : '✅ Pass'}`,
          `${result.name}`,
          `${result.checkType}`,
          `\`${result.sourceFile}\``,
          `${formatDuration(result.responseTime)} `,
        ]

        if (this.testSessionId && this.testResultIds) {
          const assets: Array<string> = []

          if (result.hasFailures && result.traceFilesUrls) {
            assets.push(`[Trace](${getTraceUrl(result.traceFilesUrls[0])})`)
          }

          if (result.hasFailures && result.videoFilesUrls) {
            assets.push(`[Video](${result.videoFilesUrls[0]})`)
          }

          const assetsColumn: string = assets.join(' \\| ')

          const linkColumn = `[Full test report](${getTestSessionUrl(this.testSessionId)}/results/${this.testResultIds[result.logicalId]})`
          tableRow.push(assetsColumn, linkColumn)
        }

        this.tableRows.push(this.tableSeparator + tableRow.join(this.tableSeparator) + this.tableSeparator)
      }
    }

    let markdown = this.header + '\n' +
    this.subHeader.join('\n') + '\n' +
    this.tableSeparator + this.tableHeaders.join('|') + this.tableSeparator + '\n' +
    this.tableSeparatorFiller.repeat(this.tableHeaders.length) + this.tableSeparator + '\n' +
    this.tableRows.sort((a, b) => a < b ? 1 : -1).join('\n') + '\n'

    if (!this.testSessionId) {
      markdown = markdown + '> Tip: use `--record` to get a full test session overview with traces, videos and logs, e.g. `npx checkly test --reporter=github --record`'
    }

    return markdown
  }
}

export default class GithubReporter extends AbstractListReporter {
  onBeginStatic () {
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2, 1)
  }

  onBegin (testSessionId?: string, testResultIds?: { [key: string]: string }) {
    this.onBeginStatic()
    this._setTestSessionId(testSessionId)
    this._setTestResultIds(testResultIds)
  }

  onEnd () {
    this._printBriefSummary()
    const githubMdBuilder = new GithubMdBuilder({
      testSessionId: this.testSessionId,
      testResultIds: this.testResultIds,
      numChecks: this.numChecks,
      runLocation: this._runLocationString(),
      checkFilesMap: this.checkFilesMap,
    })

    const markDown = githubMdBuilder.render()

    const summaryFilename = process.env.CHECKLY_REPORTER_GITHUB_OUTPUT ?? outputFile
    fs.mkdirSync(path.resolve(path.dirname(summaryFilename)), { recursive: true })
    fs.writeFileSync(summaryFilename, markDown)

    printLn(`Github summary saved in '${path.resolve(summaryFilename)}'.`, 2)
  }
}
