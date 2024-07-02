import { TestResultsShortLinks } from '../rest/test-sessions'
import { RunLocation, SequenceId } from '../services/abstract-check-runner'
import CiReporter from './ci'
import DotReporter from './dot'
import GithubReporter from './github'
import ListReporter from './list'

export interface Reporter {
  onBegin(checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string): void;
  onCheckInProgress(check: any, sequenceId: SequenceId): void;
  onCheckAttemptResult(sequenceId: SequenceId, checkResult: any, links?: TestResultsShortLinks): void;
  onCheckEnd(sequenceId: SequenceId, checkResult: any, links?: TestResultsShortLinks): void;
  onEnd(): void;
  onError(err: Error): void,
  onSchedulingDelayExceeded(): void
}

export type ReporterType = 'list' | 'dot' | 'ci' | 'github'

export const createReporters = (
  types: ReporterType[],
  runLocation: RunLocation,
  verbose: boolean,
): Reporter[] => types.map(t => {
  switch (t) {
    case 'dot':
      return new DotReporter(runLocation, verbose)
    case 'list':
      return new ListReporter(runLocation, verbose)
    case 'ci':
      return new CiReporter(runLocation, verbose)
    case 'github':
      return new GithubReporter(runLocation, verbose)
    default:
      return new ListReporter(runLocation, verbose)
  }
})
