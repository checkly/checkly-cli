import AbstractListReporter from './abstract-list.js'
import { RunLocation, SequenceId } from '../services/abstract-check-runner.js'
import { TestResultsShortLinks } from '../rest/test-sessions.js'
import type { ReporterOptions } from './reporter.js'
import { CheckStatus, formatCheckTitle, printLnErr, resultToCheckStatus } from './util.js'

export type ProgressReporterOptions = ReporterOptions & {
  // Print "Running N checks" and one line per check on stderr as its result
  // arrives. On by default; createReporters leaves it on for at most one
  // reporter, and for none when a list, dot or ci reporter runs too.
  printProgress?: boolean
}

// Base for reporters that write their report to a file in onEnd (github,
// json). Without progress lines a long run would print nothing between
// "Running N checks" and the end, so each finished check gets one line on
// stderr, which keeps stdout for the results.
export default abstract class AbstractProgressReporter extends AbstractListReporter {
  private readonly printProgress: boolean
  private numFinished = 0

  constructor (runLocation: RunLocation, verbose: boolean, options: ProgressReporterOptions = {}) {
    super(runLocation, verbose, options)
    this.printProgress = options.printProgress ?? true
  }

  onBegin (checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string) {
    super.onBegin(checks, testSessionId)
    // The header is progress too: a live console reporter prints its own, and
    // of several file reporters only the one printing progress prints it.
    if (this.printProgress) {
      printLnErr(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2)
    }
  }

  onCheckAttemptResult (sequenceId: string, checkResult: any, links?: TestResultsShortLinks): void {
    super.onCheckAttemptResult(sequenceId, checkResult, links)
    if (this.printProgress) {
      this._printProgressLine(formatCheckTitle(CheckStatus.RETRIED, checkResult, {
        includeSourceFile: Boolean(checkResult.sourceFile),
        printRetryDuration: true,
      }))
    }
  }

  onCheckEnd (sequenceId: SequenceId, checkResult: any, testResultId?: string, links?: TestResultsShortLinks) {
    super.onCheckEnd(sequenceId, checkResult, testResultId, links)
    this.numFinished++
    if (this.printProgress) {
      const { numRetries } = this.checkFilesMap!.get(checkResult.sourceFile)!.get(sequenceId)!
      const title = formatCheckTitle(resultToCheckStatus(checkResult), checkResult, {
        // `checkly trigger` results have no source file.
        includeSourceFile: Boolean(checkResult.sourceFile),
        retries: numRetries,
      })
      this._printProgressLine(`${title} [${this.numFinished}/${this.numChecks}]`)
    }
  }

  // Streamed logs draw a live summary at the bottom of an interactive
  // terminal, and the next redraw erases a fixed number of lines above the
  // cursor. Print the line above that summary and draw it again, so the
  // redraw erases the summary and not this line.
  private _printProgressLine (line: string) {
    const summaryShown = Boolean(this._clearString)
    this._clearSummary()
    printLnErr(line)
    if (summaryShown) {
      this._printSummary({ stream: 'stderr' })
    }
  }
}
