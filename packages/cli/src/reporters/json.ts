import * as fs from 'fs'
import * as path from 'path'

import AbstractListReporter, { checkFilesMap } from './abstract-list.js'
import { CheckRunId, SequenceId } from '../services/abstract-check-runner.js'
import { CheckStatus, getTestSessionUrl, printLn, printLnErr, resultToCheckStatus } from './util.js'

const outputFile = './checkly-json-report.json'

// Per-type failure-debug diagnostics for the three uptime monitor types, shaped
// like the public check-results fields (tracerouteCheckResult/grpcCheckResult/
// sslCheckResult). Sourced from the runner artifact (`checkRunData`) so
// `checkly test --reporter json` emits the data an agent needs to root-cause a
// failed run, not just `result: 'Fail'`. Returns undefined for other types or
// when no diagnostic artifact is present.
export function buildPerTypeDiagnostics (result: any): Record<string, unknown> | undefined {
  const data = result?.checkRunData
  const response = data?.response
  const requestError = data?.requestError ?? null
  if (!response && !requestError) {
    return undefined
  }

  switch (result?.checkType) {
    case 'TRACEROUTE':
      return {
        tracerouteCheckResult: {
          totalHops: response?.totalHops ?? null,
          destinationReached: response?.destinationReached ?? null,
          finalHopLatency: response?.finalHopLatency ?? null,
          truncationReason: response?.truncationReason ?? null,
          requestError,
          response: response ?? null,
        },
      }
    case 'GRPC':
      return {
        grpcCheckResult: {
          grpcStatusCode: response?.grpcStatusCode ?? null,
          grpcStatusMessage: response?.grpcStatusMessage ?? null,
          healthStatus: response?.healthStatus ?? null,
          healthStatusLabel: response?.healthStatusLabel ?? null,
          discoveredMethods: response?.discoveredMethods ?? null,
          requestError,
          response: response ?? null,
        },
      }
    case 'SSL':
      return {
        sslCheckResult: {
          tlsVersion: response?.protocol ?? null,
          cipherSuite: response?.cipherSuite ?? null,
          daysUntilExpiry: response?.daysUntilExpiry ?? null,
          handshakeTimeMs: response?.handshakeTimeMs ?? null,
          chainTrusted: response?.chainTrusted ?? null,
          hostnameVerified: response?.hostnameVerified ?? null,
          requestError,
          response: response ?? null,
        },
      }
    default:
      return undefined
  }
}

type JsonBuilderOptions = {
  testSessionId?: string
  numChecks: number
  runLocation: string
  checkFilesMap: checkFilesMap
  // Set to the limit when the run stopped early after that many failed checks.
  maxFailuresReached?: number
}

export class JsonBuilder {
  testSessionId?: string
  numChecks: number
  runLocation: string
  checkFilesMap: checkFilesMap
  maxFailuresReached?: number
  hasFilenames: boolean

  constructor (options: JsonBuilderOptions) {
    this.testSessionId = options.testSessionId
    this.numChecks = options.numChecks
    this.runLocation = options.runLocation
    this.checkFilesMap = options.checkFilesMap
    this.maxFailuresReached = options.maxFailuresReached
    this.hasFilenames = !(options.checkFilesMap.size === 1 && options.checkFilesMap.has(undefined))
  }

  render (): string {
    const testSessionSummary: any = {
      testSessionId: this.testSessionId,
      numChecks: this.numChecks,
      runLocation: this.runLocation,
      checks: [],
    }
    if (this.maxFailuresReached) {
      testSessionSummary.stoppedEarly = { reason: 'maxFailures', maxFailures: this.maxFailuresReached }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_, checkMap] of this.checkFilesMap.entries()) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [_, { check: construct, result, testResultId, numRetries }] of checkMap.entries()) {
        if (!result) {
          // Only a run that stopped early leaves checks without a result.
          testSessionSummary.checks.push({
            result: 'Not finished',
            name: (construct as any)?.name ?? null,
            // Checks fetched for `checkly trigger` carry their type; local constructs do not.
            checkType: (construct as any)?.checkType ?? null,
            durationMilliseconds: null,
            filename: this.hasFilenames ? (construct?.getSourceFile?.() ?? null) : null,
            link: null,
            runError: null,
            retries: numRetries,
          })
          continue
        }
        const checkStatus = resultToCheckStatus(result)
        const check: any = {
          result: checkStatus === CheckStatus.FAILED ? 'Fail' : checkStatus === CheckStatus.DEGRADED ? 'Degraded' : 'Pass',
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

        const diagnostics = buildPerTypeDiagnostics(result)
        if (diagnostics) {
          check.diagnostics = diagnostics
        }

        if (this.testSessionId && testResultId) {
          check.link = `${getTestSessionUrl(this.testSessionId)}/results/${testResultId}`
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
    printLnErr(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2)
  }

  onEnd () {
    this._printBriefSummary()
    const jsonBuilder = new JsonBuilder({
      testSessionId: this.testSessionId,
      numChecks: this.numChecks!,
      runLocation: this._runLocationString(),
      checkFilesMap: this.checkFilesMap!,
      maxFailuresReached: this.maxFailuresReached,
    })

    const json = jsonBuilder.render()

    const summaryFilename = process.env.CHECKLY_REPORTER_JSON_OUTPUT ?? outputFile
    fs.mkdirSync(path.resolve(path.dirname(summaryFilename)), { recursive: true })
    fs.writeFileSync(summaryFilename, json)

    printLn(`JSON report saved in '${path.resolve(summaryFilename)}'.`, 2)

    this._printTestSessionsUrl()
  }
}
