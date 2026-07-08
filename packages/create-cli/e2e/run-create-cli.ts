import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { execa } from 'execa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHECKLY_PATH = path.resolve(__dirname, '..', 'bin', 'run')

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
      // Force npm as the package manager. Without this, pnpm is detected via
      // PATH and treats the scaffolded project as part of the monorepo workspace.
      npm_config_user_agent: 'npm/10.0.0 node/v20.0.0',
      CHECKLY_CLI_VERSION: version,
      CHECKLY_E2E_PROMPTS_INJECTIONS: promptsInjection?.length ? JSON.stringify(promptsInjection) : undefined,
      CHECKLY_E2E_LOCAL_TEMPLATE_ROOT: path.join(__dirname, '../../../examples'),
      CHECKLY_E2E_ISTTY: 'true',
      // Set SHELL so @oclif/core's getShell() short-circuits instead of running
      // determineWindowsShell(), which spawns `powershell.exe -Command Get-CimInstance`
      // on every command. That spawn costs seconds per command on Windows and would
      // otherwise dominate the e2e suite. Because extendEnv is false the child gets no
      // SHELL unless we pass it here; on Linux process.env.SHELL is set, on Windows it
      // is typically unset so we fall back to powershell.exe.
      SHELL: process.env.SHELL ?? 'powershell.exe',
      ...env,
    },
    cwd: directory ?? process.cwd(),
    encoding: 'utf8',
    timeout,
    reject: false,
    extendEnv: false,
    shell: process.platform === 'win32',
  })

  return result
}
