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
  return new Promise<{ status: number|null, stdout: string, stderr: string }>((resolve) => {
    let stdout = ''
    let stderr = ''
    const child = childProcess.spawn(CHECKLY_PATH, args, {
      env: {
        PATH: process.env.PATH,
        CHECKLY_API_KEY: apiKey,
        CHECKLY_ACCOUNT_ID: accountId,
        CHECKLY_ENV: process.env.CHECKLY_ENV,
        // We need the CLI to report 4.8.0 or greater in order for the backend to use the new MQTT topic format.
        // Once 4.8.0 has been released, we can remove the 4.8.0 fallback here.
        CHECKLY_CLI_VERSION: cliVersion ?? '4.8.0',
        CHECKLY_E2E_PROMPTS_INJECTIONS: promptsInjection?.length ? JSON.stringify(promptsInjection) : undefined,
        ...env,
      },
      cwd: directory ?? process.cwd(),
      shell: process.platform === 'win32',
    })
    const processTimeout = setTimeout(() => {
      // workaround to kill child process on win32
      if (process.platform === 'win32' && child.pid) {
        childProcess.spawnSync('taskkill', ['/pid', child.pid.toString(), '/f', '/t'])
      }
      child.kill()
    }, timeout)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })

    child.on('close', (code) => {
      clearTimeout(processTimeout)
      resolve({ status: code, stdout, stderr })
    })
    child.on('exit', (code) => {
      clearTimeout(processTimeout)
      resolve({ status: code, stdout, stderr })
    })
    child.on('error', () => {
      clearTimeout(processTimeout)
      resolve({ status: null, stdout, stderr })
    })
  })
}
