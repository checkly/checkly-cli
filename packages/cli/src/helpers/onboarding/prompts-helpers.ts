export function makeOnCancel (log: (msg: string) => void) {
  return () => {
    log('\nSetup cancelled. Run npx checkly init anytime to try again.')
    process.exit(0)
  }
}
