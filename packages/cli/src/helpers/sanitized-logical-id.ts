import chalk from 'chalk'
import prompts from 'prompts'
import { Session } from '../constructs'

interface LogFunction {
  (message: string): void
}

/**
 * Checks if any logicalIds were sanitized during parsing and prompts the user
 * for confirmation before proceeding.
 *
 * @param log - Function to log messages (e.g., this.log from a command)
 * @param options - Optional configuration
 * @param options.force - If true, skip the confirmation prompt
 * @returns true if the operation should continue, false if aborted
 */
export async function confirmSanitizedLogicalIds (
  log: LogFunction,
  options: { force?: boolean } = {},
): Promise<boolean> {
  const sanitizedIds = Session.getSanitizedLogicalIds()

  if (sanitizedIds.length === 0 || options.force) {
    return true
  }

  log(chalk.yellow('\nThe following logicalIds contain invalid characters and will be sanitized:\n'))
  for (const { constructType, original, sanitized } of sanitizedIds) {
    log(`  ${constructType}: "${original}" → "${sanitized}"`)
  }
  log('')
  log(chalk.dim('Your source files will not be modified. The sanitized logicalIds will only'))
  log(chalk.dim('be used when syncing with Checkly. To avoid this warning, update your'))
  log(chalk.dim('configuration to use valid characters (A-Z, a-z, 0-9, _ - / # .).\n'))

  const { confirm } = await prompts({
    name: 'confirm',
    type: 'confirm',
    message: 'Do you want to continue with the sanitized logicalIds?',
  })

  if (!confirm) {
    log('Aborted. Please update your configuration to use valid logicalId characters.')
    return false
  }

  return true
}
