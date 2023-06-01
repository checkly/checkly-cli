import * as path from 'path'
import * as childProcess from 'node:child_process'

const CHECKLY_PATH = path.resolve(path.dirname(__filename), '..', 'bin', 'run')

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
    timeout = 30000,
  } = options
  return childProcess.spawnSync(CHECKLY_PATH, args, {
    env: {
      PATH: process.env.PATH,
      CHECKLY_API_KEY: apiKey,
      CHECKLY_ACCOUNT_ID: accountId,
      CHECKLY_ENV: process.env.CHECKLY_ENV,
      ...env,
    },
    cwd: directory ?? process.cwd(),
    encoding: 'utf-8',
    timeout,
    shell: process.platform === 'win32',
  })
}

// TODO: refactor the function for general usage (not just switch command)
export function runChecklyCliForSwitch (options: {
  directory?: string,
  args?: string[],
  apiKey?: string,
  accountId?: string,
  env?: object,
  timeout?: number,
}): Promise<{ stdout: string, stderr: string, status: number}> {
  const {
    directory,
    args = [],
    apiKey,
    accountId,
    env = {},
    timeout = 30000,
  } = options
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const executionTimeout = setTimeout(() => resolve({ stdout, stderr, status: 1 }), timeout)
    const command = childProcess.spawn(CHECKLY_PATH, args, {
      env: {
        PATH: process.env.PATH,
        CHECKLY_API_KEY: apiKey,
        CHECKLY_ACCOUNT_ID: accountId,
        CHECKLY_ENV: process.env.CHECKLY_ENV,
        ...env,
      },
      cwd: directory ?? process.cwd(),
      shell: process.platform === 'win32',
    })

    command.stdout.on('data', (data) => {
      stdout += data.toString()
      if (data.toString().includes('Select a new Checkly account')) {
        command.stdin.write('\n')
        command.stdin.end()
      }
    })

    command.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    command.on('exit', (code) => {
      clearTimeout(executionTimeout)
      resolve({ stdout, stderr, status: code ?? 1 })
    })

    command.on('close', (code) => {
      clearTimeout(executionTimeout)
      resolve({ stdout, stderr, status: code ?? 1 })
    })
  })
}
