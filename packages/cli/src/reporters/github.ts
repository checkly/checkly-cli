import * as fs from 'fs'
import * as path from 'path'

import AbstractListReporter from './abstract-list'
import { formatDuration, printLn, getTestSessionUrl } from './util'

const header = '# Checkly Test Session Summary\n'
const subHeader: Array<string> = []
const failures: Array<string> = []
const githubSummaryEntries: Array<string> = []

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
    subHeader.push(
      `Ran **${this.numChecks}** checks in **${this._runLocationString()}**.\n`,
    )

    if (this.testSessionId) {
      subHeader.push(
       `[Detailed session summary](${getTestSessionUrl(this.testSessionId)})\n`,
      )
    }
    for (const [_, checkMap] of this.checkFilesMap.entries()) {
      for (const [_, { check, result }] of checkMap.entries()) {
        if (result.hasFailures) {
          failures.push(
            `[${check?.constructor.name}] > ${result.sourceFile} > ${result.name}`,
          )
        }
        githubSummaryEntries.push(
          `| ${result.hasFailures ? '❌ Fail' : '✅ Pass'} | ${result.name} | ${
            result.checkType} | \`${result.sourceFile}\` | ${formatDuration(result.responseTime)} |`,
        )
      }
    }
    const summaryFilename = process.env.CHECKLY_REPORTER_GITHUB_OUTPUT ?? './checkly-github-report.md'
    fs.mkdirSync(path.resolve(path.dirname(summaryFilename)), { recursive: true })
    fs.writeFileSync(summaryFilename,
      header +
      subHeader +
      '| Result | Name | Check Type | Filename | Duration |' +
      '\n' + '|:- |:- |:- |:- |:- |' + '\n' +
      githubSummaryEntries.sort((a, b) => a < b ? 1 : -1).join('\n') + '\n',
    )
    printLn(`Github summary saved in '${path.resolve(summaryFilename)}'.`, 2)
  }
}
