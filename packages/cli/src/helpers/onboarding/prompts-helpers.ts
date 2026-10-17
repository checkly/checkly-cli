import { Errors } from '@oclif/core'
import logSymbols from 'log-symbols'

export function makeOnCancel (log: (msg: string) => void) {
  return () => {
    log('\nSetup cancelled. Run npx checkly init anytime to try again.')
    // Unlike process.exit(), oclif unwinds this into a clean exit that flushes output.
    throw new Errors.ExitError(0)
  }
}

export function successMessage (message: string): string {
  return `${logSymbols.success} ${message}`
}
