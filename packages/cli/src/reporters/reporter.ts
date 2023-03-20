import { isCI } from 'ci-info'
import { Check } from '../constructs/check'
import { RunLocation } from '../services/check-runner'
import CiReporter from './ci'
import DotReporter from './dot'
import ListReporter from './list'

export interface Reporter {
  onBeginStatic(): void;
  onBegin(): void;
  onEnd(): void;
  onCheckEnd(checkResult: any): void;
}

export type ReporterType = 'list' | 'dot' | 'ci'

export const createReporter = (
  type: ReporterType = 'list',
  runLocation: RunLocation,
  checks: Array<Check>,
  verbose: boolean,
): Reporter => {
  switch (type) {
    case 'dot':
      return new DotReporter(runLocation, checks, verbose)
    case 'ci':
      return new CiReporter(runLocation, checks, verbose)
    default:
      return isCI ? new CiReporter(runLocation, checks, verbose) : new ListReporter(runLocation, checks, verbose)
  }
}
