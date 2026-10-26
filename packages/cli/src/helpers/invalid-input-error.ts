/**
 * Input that is invalid on its own, whatever the account holds: a malformed or
 * out-of-range flag or argument value, or flags that cannot be combined. The
 * command exits 2, the usage-error code, instead of 1.
 */
export class InvalidInputError extends Error {
  // oclif's Command.catch and error handler take the exit code from here.
  oclif = { exit: 2 }
}

/**
 * The exit code of a failure a command reports itself (e.g. as a JSON error
 * document) instead of letting it propagate to oclif.
 */
export function exitCodeFor (err: unknown): number {
  return err instanceof InvalidInputError ? 2 : 1
}
