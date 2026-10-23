import config from '../services/config.js'
import commonMessages from '../messages/common-messages.js'

/** Accounts as `Name (id), …`, for messages that list them. */
export function formatAccounts (accounts: Array<{ id: string, name: string }>): string {
  return accounts.map(({ id, name }) => `${name} (${id})`).join(', ')
}

/**
 * The notice that `CHECKLY_ACCOUNT_ID` picks the account instead of the
 * stored default, while it does; undefined otherwise.
 */
export function accountOverrideNotice (): string | undefined {
  return config.getCredentialSource() === 'account_override'
    ? commonMessages.accountOverride(config.getAccountId())
    : undefined
}

/**
 * Why a `CHECKLY_ACCOUNT_ID` does not work with the login: most likely a
 * typo or another user's account, so it lists the accounts the login does
 * work with when they are known.
 */
export function accountOverrideNotAvailable (
  accountId: string, accounts?: Array<{ id: string, name: string }>,
): string {
  return `Account "${accountId}" from \`CHECKLY_ACCOUNT_ID\` is not available with your login.`
    + (accounts ? ` This login works with: ${formatAccounts(accounts)}.` : '')
    + ' Fix `CHECKLY_ACCOUNT_ID` where it is set (the command line, your shell or .env).'
}

/**
 * Why the credentials cannot use `accountId`, worded for where the account
 * and the key come from, so the message says what to fix. `accounts` lists
 * the accounts a login works with, when they are known.
 */
export function accountNotAvailable (
  accountId: string, accounts?: Array<{ id: string, name: string }>,
): string {
  switch (config.getCredentialSource()) {
    case 'account_override':
      return accountOverrideNotAvailable(accountId, accounts)
    case 'login':
      return `Account "${accountId}" is not available with the stored login. Run \`npx checkly login\` to log in again.`
    case 'environment':
      // An API key without `CHECKLY_ACCOUNT_ID` falls back to the account
      // stored by `checkly login`, which the key need not be able to access.
      if (config.hasAccountIdInEnvironment()) {
        return `Account "${accountId}" from \`CHECKLY_ACCOUNT_ID\` is not available with \`CHECKLY_API_KEY\`. `
          + 'Set `CHECKLY_ACCOUNT_ID` to an account the key can access, or `CHECKLY_API_KEY` to a key that can '
          + `access account "${accountId}" (on the command line, in your shell or in .env).`
      }
      return `Account "${accountId}", the default stored by \`checkly login\`, is not available with `
        + '`CHECKLY_API_KEY`. Set `CHECKLY_ACCOUNT_ID` to an account the key can access (on the command line, '
        + 'in your shell or in .env).'
  }
}
