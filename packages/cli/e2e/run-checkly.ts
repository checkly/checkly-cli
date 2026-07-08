import config from 'config'

import type { FixtureSandbox, RunOptions } from '../src/testing/fixture-sandbox.js'
import type { Account } from '../src/rest/accounts.js'

export function checklyEnv (overrides?: {
  apiKey?: string
  accountId?: string
  cliVersion?: string
  promptsInjection?: (string | boolean | Account)[]
  env?: Record<string, string | undefined>
}): Record<string, string | undefined> {
  const {
    apiKey = config.get<string>('apiKey'),
    accountId = config.get<string>('accountId'),
    cliVersion = '4.8.0',
    promptsInjection = [],
    env = {},
  } = overrides ?? {}

  return {
    // Force interactive mode so CI env vars (GITHUB_ACTIONS, CI, etc.)
    // don't make the CLI switch to JSON confirmation output.
    PATH: process.env.PATH,
    CHECKLY_CLI_MODE: 'interactive',
    CHECKLY_API_KEY: apiKey,
    CHECKLY_ACCOUNT_ID: accountId,
    CHECKLY_ENV: process.env.CHECKLY_ENV,
    CHECKLY_CLI_VERSION: cliVersion,
    CHECKLY_E2E_PROMPTS_INJECTIONS: promptsInjection?.length ? JSON.stringify(promptsInjection) : undefined,
    CHECKLY_E2E_DISABLE_FANCY_OUTPUT: '1',
    // Set SHELL so @oclif/core's getShell() short-circuits instead of running
    // determineWindowsShell(), which spawns `powershell.exe -Command Get-CimInstance`
    // on every command. That spawn costs seconds per command on Windows and is the
    // dominant cost of the Windows e2e suite. On Linux SHELL is already set, so this
    // only changes behaviour on Windows where it would otherwise be unset.
    SHELL: process.env.SHELL ?? 'powershell.exe',
    ...env,
  }
}

export function runCheckly (
  fixt: FixtureSandbox,
  args: string[],
  options?: RunOptions & {
    apiKey?: string
    accountId?: string
    cliVersion?: string
    promptsInjection?: (string | boolean | Account)[]
  },
) {
  const { apiKey, accountId, cliVersion, promptsInjection, ...runOptions } = options ?? {}

  return fixt.run('pnpm', ['checkly', ...args], {
    timeout: 30_000,
    extendEnv: false,
    ...runOptions,
    env: {
      ...checklyEnv({ apiKey, accountId, cliVersion, promptsInjection }),
      ...runOptions.env,
    },
  })
}
