import path from 'node:path'

import execa from 'execa'

const CHECKLY_PATH = path.resolve(path.dirname(__filename), '..', 'bin', 'run')

export async function runChecklyCreateCli (options: {
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

  // Mock TTY behavior for CI environments
  const result = await execa('node', ['-e', `
    // Mock isTTY properties to simulate interactive terminal
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
    // Load and run the CLI
    require('${CHECKLY_PATH.replace(/\\/g, '\\\\')}');
  `, ...args], {
    env: {
      PATH: process.env.PATH,
      CHECKLY_CLI_VERSION: version,
      CHECKLY_E2E_PROMPTS_INJECTIONS: promptsInjection?.length ? JSON.stringify(promptsInjection) : undefined,
      CHECKLY_E2E_LOCAL_TEMPLATE_ROOT: path.join(__dirname, '../../../examples'),
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
