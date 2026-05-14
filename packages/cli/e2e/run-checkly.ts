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
    CHECKLY_CLI_MODE: 'interactive',
    CHECKLY_API_KEY: apiKey,
    CHECKLY_ACCOUNT_ID: accountId,
    CHECKLY_ENV: process.env.CHECKLY_ENV,
    CHECKLY_CLI_VERSION: cliVersion,
    CHECKLY_E2E_PROMPTS_INJECTIONS: promptsInjection?.length ? JSON.stringify(promptsInjection) : undefined,
    CHECKLY_E2E_DISABLE_FANCY_OUTPUT: '1',
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
    ...runOptions,
    env: {
      ...checklyEnv({ apiKey, accountId, cliVersion, promptsInjection }),
      ...runOptions.env,
    },
  })
}
