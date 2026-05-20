import { Hook } from '@oclif/core'
import chalk from 'chalk'

// All oclif parser errors extend CLIParseError, which carries a `parse` field.
// `@oclif/core` does not re-export the class, so we sniff for that property.
function isParseError (error: unknown): error is Error & { parse: unknown } {
  return error instanceof Error && 'parse' in error
}

// eslint-disable-next-line require-await
const hook: Hook<'finally'> = async function ({ config, error }) {
  if (!isParseError(error)) return

  const skills = chalk.cyan.bold(`${config.bin} skills`)
  error.message += `\nNeed agent workflows or docs? Run ${skills}.`
}

export default hook
