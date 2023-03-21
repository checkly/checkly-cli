import chalk = require('chalk')
import * as fs from 'fs'

import AbstractListReporter from './abstract-list'
import type { PublicRunLocation } from '../services/check-runner'
import { formarDuration, formatCheckResult, printLn } from './util'
import indentString = require('indent-string')

export default class GithubReporter extends AbstractListReporter {
  onBeginStatic () {
    printLn(`${chalk.bold.grey('Running')} ${chalk.bold.white(this.numChecks)} ${chalk.bold.grey('tests in')} ${chalk.bold.white((this.runLocation as PublicRunLocation).region)} ${chalk.bold.grey('location')}.`, undefined, 1)
  }

  onBegin () {
    this.onBeginStatic()
  }

  onEnd () {
    this._printBriefSummary()
    const failures = []
    const githubAnnotation = []
    const githubSummaryEntries = []
    for (const [_, checkMap] of this.checkFilesMap.entries()) {
      for (const [_, { check, result }] of checkMap.entries()) {
        if (result.hasFailures) {
          failures.push(
            `[${check?.constructor.name}] > ${result.sourceFile} > ${result.name} > [${result.runLocation}]`,
          )
          githubAnnotation.push(
            `::error file=${result.sourceFile},title=[${check?.constructor.name}] > ${result.name} > [${result.runLocation}]::` +
              indentString(formatCheckResult(result), 4).replace(/\n/g, '%0A'),
          )
        }
        githubSummaryEntries.push(
          `| ${result.hasFailures ? ':x: Fail' : ':white_check_mark: Pass'} | ${result.checkType} | ${
            result.sourceFile.replace(/_/g, '\\_')} | ${result.name} | ${
              result.runLocation} | ${formarDuration(result.responseTime)} |`,
        )
      }
    }
    const summaryFilename = process.env.CHECKLY_REPORTER_GITHUB_OUTPUT ?? 'checkly-github-report.md'
    fs.writeFileSync(summaryFilename,
      '| Check Result | Type | Filename | Name | Location | Duration |' +
      '\n' + '| - | - | - | - | - | - |' + '\n' +
      githubSummaryEntries.sort((a, b) => a < b ? 1 : -1).join('\n') + '\n',
    )
    printLn(`Github summary saved in '${summaryFilename}'.`, 2)

    githubAnnotation.forEach(r => printLn(r))

    if (failures.length) {
      failures.unshift(`${failures.length} failed`)
    }
    printLn(`::notice title=🦝 Checkly Run Summary::  ${
      failures.join(' ─────────────────────────────────────────────────── %0A    ')}  %0A${
        githubSummaryEntries.length ?? 0} passed`)
  }
}
