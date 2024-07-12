import { TestResultsShortLinks } from '../rest/test-sessions'
import { RunLocation, CheckRunId } from '../services/abstract-check-runner'
import CiReporter from './ci'
import DotReporter from './dot'
import GithubReporter from './github'
import ListReporter from './list'
import JsonReporter from './json'

export interface Reporter {
  onBegin(checks: Array<{ check: any, checkRunId: CheckRunId, testResultId?: string }>, testSessionId?: string): void;
  onCheckInProgress(check: any, checkRunId: CheckRunId): void;
  onEnd(): void;
  onCheckEnd(checkRunId: CheckRunId, checkResult: any, links?: TestResultsShortLinks): void;
  onError(err: Error): void,
  onSchedulingDelayExceeded(): void
}

export type ReporterType = 'list' | 'dot' | 'ci' | 'github' | 'json'

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
    case 'json':
      return new JsonReporter(runLocation, verbose)
    default:
      return new ListReporter(runLocation, verbose)
  }
})
