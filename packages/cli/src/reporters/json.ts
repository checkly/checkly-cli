import * as fs from 'fs'
import * as path from 'path'

import AbstractListReporter, { checkFilesMap } from './abstract-list'
import { CheckRunId, SequenceId } from '../services/abstract-check-runner'
import { printLn } from './util'

const outputFile = './checkly-json-report.json'

type JsonBuilderOptions = {
  testSessionId?: string
  numChecks: number
  runLocation: string
  checkFilesMap: checkFilesMap
}

export class JsonBuilder {
  testSessionId?: string
  numChecks: number
  runLocation: string
  checkFilesMap: checkFilesMap
  hasFilenames: boolean

  constructor (options: JsonBuilderOptions) {
    this.testSessionId = options.testSessionId
    this.numChecks = options.numChecks
    this.runLocation = options.runLocation
    this.checkFilesMap = options.checkFilesMap
    this.hasFilenames = !(options.checkFilesMap.size === 1 && options.checkFilesMap.has(undefined))
  }

  render (): string {
    const testSessionSummary: any = {
      testSessionId: this.testSessionId,
      numChecks: this.numChecks,
      runLocation: this.runLocation,
      checks: [],
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_, checkMap] of this.checkFilesMap.entries()) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [_, { result, links, numRetries }] of checkMap.entries()) {
        const check: any = {
          result: result.hasFailures ? 'Fail' : 'Pass',
          name: result.name,
          checkType: result.checkType,
          durationMilliseconds: result.responseTime ?? null,
          filename: null,
          link: null,
          runError: result.runError || null,
          retries: numRetries,
        }

        if (this.hasFilenames) {
          check.filename = result.sourceFile
        }

        if (links?.testResultLink) {
          check.link = links?.testResultLink
        }

        testSessionSummary.checks.push(check)
      }
    }

    return JSON.stringify(testSessionSummary, null, 2)
  }
}

export default class JsonReporter extends AbstractListReporter {
  onBegin (checks: Array<{ check: any, checkRunId: CheckRunId, sequenceId: SequenceId }>, testSessionId?: string) {
    super.onBegin(checks, testSessionId)
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2, 1)
  }

  onEnd () {
    this._printBriefSummary()
    const jsonBuilder = new JsonBuilder({
      testSessionId: this.testSessionId,
      numChecks: this.numChecks!,
      runLocation: this._runLocationString(),
      checkFilesMap: this.checkFilesMap!,
    })

    const json = jsonBuilder.render()

    const summaryFilename = process.env.CHECKLY_REPORTER_JSON_OUTPUT ?? outputFile
    fs.mkdirSync(path.resolve(path.dirname(summaryFilename)), { recursive: true })
    fs.writeFileSync(summaryFilename, json)

    printLn(`JSON report saved in '${path.resolve(summaryFilename)}'.`, 2)

    this._printTestSessionsUrl()
  }
}
