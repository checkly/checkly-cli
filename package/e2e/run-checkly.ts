import * as path from 'path'
import * as childProcess from 'node:child_process'

const CHECKLY_PATH = path.resolve(path.dirname(__filename), '../bin/run')

export function runChecklyCli (options: {
  directory?: string,
  args?: string[],
  apiKey?: string,
  accountId?: string,
  env?: object,
  timeout?: number,
}) {
  const {
    directory,
    args = [],
    apiKey,
    accountId,
    env = {},
    timeout = 10000,
  } = options
  return childProcess.spawnSync(CHECKLY_PATH, args, {
    env: {
      PATH: process.env.PATH,
      CHECKLY_API_KEY: apiKey,
      CHECKLY_ACCOUNT_ID: accountId,
      ...env
    },
    cwd: directory ?? process.cwd(),
    encoding: 'utf-8',
    timeout,
  })
}
