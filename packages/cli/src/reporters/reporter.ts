import { TestResultsShortLinks } from '../rest/test-sessions.js'
import { RunLocation, SequenceId } from '../services/abstract-check-runner.js'
import CiReporter from './ci.js'
import DotReporter from './dot.js'
import GithubReporter from './github.js'
import ListReporter from './list.js'
import JsonReporter from './json.js'

export interface Reporter {
  onBegin(checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string): void
  onCheckInProgress(check: any, sequenceId: SequenceId): void
  onCheckAttemptResult(sequenceId: SequenceId, checkResult: any, links?: TestResultsShortLinks): void
  onCheckEnd(sequenceId: SequenceId, checkResult: any, testResultId?: string, links?: TestResultsShortLinks): void
  onEnd(): void
  onError(err: Error): void
  onSchedulingDelayExceeded(): void
  onStreamLogs(check: any, sequenceId: SequenceId, logs: Array<{ timestamp: number, message: string }>): void
  onCancel(): void
}

export type ReporterType = 'list' | 'dot' | 'ci' | 'github' | 'json'

export type ReporterOptions = {
  showStreamingHeaders?: boolean
}

export const createReporters = (
  types: ReporterType[],
  runLocation: RunLocation,
  verbose: boolean,
  options: ReporterOptions = {},
): Reporter[] => types.map(t => {
  switch (t) {
    case 'dot':
      return new DotReporter(runLocation, verbose, options)
    case 'list':
      return new ListReporter(runLocation, verbose, options)
    case 'ci':
      return new CiReporter(runLocation, verbose, options)
    case 'github':
      return new GithubReporter(runLocation, verbose, options)
    case 'json':
      return new JsonReporter(runLocation, verbose, options)
    default:
      return new ListReporter(runLocation, verbose, options)
  }
})
