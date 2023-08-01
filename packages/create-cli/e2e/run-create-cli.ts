import * as path from 'path'
import * as childProcess from 'node:child_process'

const CHECKLY_PATH = path.resolve(path.dirname(__filename), '..', 'bin', 'run')

export function runChecklyCli (options: {
  directory?: string,
  args?: string[],
  env?: object,
  version?: string,
  promptsInjection?: (string | boolean)[],
  timeout?: number,
}) {
  const {
    directory,
    args = [],
    env = {},
    version = '4.0.13',
    promptsInjection = [],
    timeout = 30000,
  } = options
  return childProcess.spawnSync(CHECKLY_PATH, args, {
    env: {
      PATH: process.env.PATH,
      CHECKLY_CLI_VERSION: version,
      CHECKLY_E2E_PROMPTS_INJECTIONS: JSON.stringify(promptsInjection),
      ...env,
    },
    cwd: directory ?? process.cwd(),
    encoding: 'utf-8',
    timeout,
    shell: process.platform === 'win32',
  })
}
