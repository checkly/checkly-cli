import logSymbols from 'log-symbols'

export function makeOnCancel (log: (msg: string) => void) {
  return () => {
    log('\nSetup cancelled. Run npx checkly init anytime to try again.')
    process.exit(0)
  }
}

export function successMessage (message: string): string {
  return `${logSymbols.success} ${message}`
}
