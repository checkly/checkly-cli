import { Check } from '../constructs/check'
import { RunLocation } from '../services/check-runner'
import CiReporter from './ci'
import DotReporter from './dot'
import GithubReporter from './github'
import ListReporter from './list'

export interface Reporter {
  onBeginStatic(): void;
  onBegin(testSessionId: string, testResultIds?: { [key: string]: string }): void;
  onEnd(): void;
  onCheckEnd(checkResult: any): void;
  onError(err: Error): void,
}

export type ReporterType = 'list' | 'dot' | 'ci' | 'github'

export const createReporters = (
  types: ReporterType[],
  runLocation: RunLocation,
  checks: Array<Check>,
  verbose: boolean,
): Reporter[] => types.map(t => {
  switch (t) {
    case 'dot':
      return new DotReporter(runLocation, checks, verbose)
    case 'list':
      return new ListReporter(runLocation, checks, verbose)
    case 'ci':
      return new CiReporter(runLocation, checks, verbose)
    case 'github':
      return new GithubReporter(runLocation, checks, verbose)
    default:
      return new ListReporter(runLocation, checks, verbose)
  }
})
