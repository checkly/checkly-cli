import * as path from 'path'
import * as childProcess from 'node:child_process'
import type { Account } from '../src/rest/accounts'

const CHECKLY_PATH = path.resolve(path.dirname(__filename), '..', 'bin', 'run')

export function runChecklyCli (options: {
  directory?: string,
  args?: string[],
  apiKey?: string,
  accountId?: string,
  env?: object,
  cliVersion?: string,
  promptsInjection?: (string | boolean | Account)[],
  timeout?: number,
}) {
  const {
    directory,
    args = [],
    apiKey,
    accountId,
    env = {},
    cliVersion,
    promptsInjection = [],
    timeout = 30000,
  } = options
  return childProcess.spawnSync(CHECKLY_PATH, args, {
    env: {
      PATH: process.env.PATH,
      CHECKLY_API_KEY: apiKey,
      CHECKLY_ACCOUNT_ID: accountId,
      CHECKLY_ENV: process.env.CHECKLY_ENV,
      CHECKLY_CLI_VERSION: cliVersion,
      CHECKLY_E2E_PROMPTS_INJECTIONS: promptsInjection?.length ? JSON.stringify(promptsInjection) : undefined,
      ...env,
    },
    cwd: directory ?? process.cwd(),
    encoding: 'utf-8',
    timeout,
    shell: process.platform === 'win32',
  })
}
