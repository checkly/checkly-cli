import path from 'node:path'
import * as pty from 'node-pty'

const CHECKLY_PATH = path.resolve(path.dirname(__filename), '..', 'bin', 'run')

export async function runChecklyCreateCli(options: {
  directory?: string,
  args?: string[],
  env?: object,
  version?: string,
  promptsInjection?: (string | boolean | object)[],
  timeout?: number,
}) {
  const {
    directory,
    args = [],
    env = {},
    version,
    promptsInjection = [],
    timeout = 30000,
  } = options

  return new Promise((resolve) => {
    let stdout = ''
    const stderr = ''

    // Use node-pty to create a real pseudo-terminal
    const ptyProcess = pty.spawn('node', [CHECKLY_PATH, ...args], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: directory ?? process.cwd(),
      env: {
        ...process.env,
        PATH: process.env.PATH,
        CHECKLY_CLI_VERSION: version,
        CHECKLY_E2E_PROMPTS_INJECTIONS: promptsInjection?.length ? JSON.stringify(promptsInjection) : undefined,
        CHECKLY_E2E_LOCAL_TEMPLATE_ROOT: path.join(__dirname, '../../../examples'),
        ...env,
      },
    })

    let timeoutId: NodeJS.Timeout | null = null

    if (timeout) {
      timeoutId = setTimeout(() => {
        ptyProcess.kill()
        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr + '\nTimeout reached',
        })
      }, timeout)
    }

    ptyProcess.onData((data) => {
      stdout += data
    })

    ptyProcess.onExit((exitCode) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      resolve({
        exitCode: exitCode?.exitCode ?? 0,
        stdout,
        stderr,
      })
    })
  })
}
