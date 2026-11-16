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
  onDetach(): void
  onMaxFailuresReached(maxFailures: number): void
}

export type ReporterType = 'list' | 'dot' | 'ci' | 'github' | 'json'

export type ReporterOptions = {
  showStreamingHeaders?: boolean
}

// Reporters that already print each check to the console while the run is
// in progress.
const LIVE_CONSOLE_REPORTERS: ReporterType[] = ['list', 'dot', 'ci']

// Reporters that write their report to a file at the end and print progress
// lines while the run is in progress (AbstractProgressReporter).
const PROGRESS_REPORTERS: ReporterType[] = ['github', 'json']

export const createReporters = (
  types: ReporterType[],
  runLocation: RunLocation,
  verbose: boolean,
  options: ReporterOptions = {},
): Reporter[] => {
  // At most one progress reporter prints progress, and none next to a live
  // console reporter, so a check never shows up twice in the same log.
  const progressIndex = types.some(type => LIVE_CONSOLE_REPORTERS.includes(type))
    ? -1
    : types.findIndex(type => PROGRESS_REPORTERS.includes(type))
  return types.map((t, i) => {
    const progressOptions = { ...options, printProgress: i === progressIndex }
    switch (t) {
      case 'dot':
        return new DotReporter(runLocation, verbose, options)
      case 'list':
        return new ListReporter(runLocation, verbose, options)
      case 'ci':
        return new CiReporter(runLocation, verbose, options)
      case 'github':
        return new GithubReporter(runLocation, verbose, progressOptions)
      case 'json':
        return new JsonReporter(runLocation, verbose, progressOptions)
      default:
        return new ListReporter(runLocation, verbose, options)
    }
  })
}
