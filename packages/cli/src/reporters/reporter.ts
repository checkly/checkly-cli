import { RunLocation, CheckRunId } from '../services/abstract-check-runner'
import CiReporter from './ci'
import DotReporter from './dot'
import GithubReporter from './github'
import ListReporter from './list'

export interface Reporter {
  onBeginStatic(): void;
  onBegin(checks: Array<{ check: any, checkRunId: CheckRunId, testResultId?: string }>, testSessionId?: string): void;
  onEnd(): void;
  onCheckEnd(checkRunId: CheckRunId, checkResult: any): void;
  onError(err: Error): void,
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
