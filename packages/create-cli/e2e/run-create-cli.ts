import path from 'node:path'

import execa from 'execa'

const CHECKLY_PATH = path.resolve(path.dirname(__filename), '..', 'bin', 'run')

export async function runChecklyCreateCli (options: {
  directory?: string
  args?: string[]
  env?: object
  version?: string
  promptsInjection?: (string | boolean | object)[]
  timeout?: number
}) {
  const {
    directory,
    args = [],
    env = {},
    version,
    promptsInjection = [],
    timeout = 30000,
  } = options

  const result = await execa(CHECKLY_PATH, args, {
    env: {
      PATH: process.env.PATH,
      CHECKLY_CLI_VERSION: version,
      CHECKLY_E2E_PROMPTS_INJECTIONS: promptsInjection?.length ? JSON.stringify(promptsInjection) : undefined,
      CHECKLY_E2E_LOCAL_TEMPLATE_ROOT: path.join(__dirname, '../../../examples'),
      CHECKLY_E2E_ISTTY: 'true',
      ...env,
    },
    cwd: directory ?? process.cwd(),
    encoding: 'utf-8',
    timeout,
    reject: false,
    shell: process.platform === 'win32',
  })

  return result
}
