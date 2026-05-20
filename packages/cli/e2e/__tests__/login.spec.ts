import { execa } from 'execa'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { checklyEnv, runCheckly } from '../run-checkly'

// Run a CLI command that is expected to hang (e.g. waiting for OAuth callback),
// kill the process tree after a delay, and return stdout/stderr collected so far.
async function runAndKill (
  fixt: FixtureSandbox,
  args: string[],
  options: { delay: number, env?: Record<string, string | undefined>, promptsInjection?: (string | boolean)[] },
): Promise<{ stdout: string, stderr: string }> {
  const { delay, env, promptsInjection } = options
  const subprocess = execa('pnpm', ['checkly', ...args], {
    cwd: fixt.root,
    extendEnv: false,
    detached: process.platform !== 'win32',
    env: {
      ...checklyEnv({ promptsInjection }),
      ...env,
    },
  })

  let stdout = ''
  let stderr = ''
  subprocess.stdout?.on('data', (data: Buffer) => {
    stdout += data.toString()
  })
  subprocess.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString()
  })

  // Attach rejection handler immediately to prevent unhandled rejection
  const done = subprocess.catch(() => {})

  await new Promise(resolve => setTimeout(resolve, delay))

  // Kill the entire process tree. On Windows, taskkill /T kills pnpm and
  // its grandchild node process. detached: true breaks stdio on Windows so
  // we only use it on Unix where negative PID kills the process group.
  if (process.platform === 'win32') {
    await execa('taskkill', ['/F', '/T', '/PID', String(subprocess.pid)], { reject: false })
  } else {
    try {
      process.kill(-subprocess.pid!, 'SIGKILL')
    } catch { /* already dead */ }
  }

  await done
  return { stdout, stderr }
}

describe('login', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  beforeEach(async () => {
    try {
      await runCheckly(fixt, ['logout'], {
        promptsInjection: [true],
        timeout: 5000,
      })
    } catch {
      // logout may fail if not logged in, that's fine
    }
  })

  it('should show warning with environment variables are configured', async () => {
    const { stderr } = await runCheckly(fixt, ['login'], {
      timeout: 5000,
    })
    expect(stderr).toContain('Warning: `CHECKLY_API_KEY` or `CHECKLY_ACCOUNT_ID` environment variables')
    expect(stderr).toContain('are configured. You must delete them to use `npx checkly login`.')
  }, 10000)

  it('should show URL to login', async () => {
    const { stdout, stderr } = await runAndKill(fixt, ['login'], {
      delay: 5000,
      promptsInjection: ['login', false],
      env: {
        CHECKLY_API_KEY: undefined,
        CHECKLY_ACCOUNT_ID: undefined,
      },
    })

    expect(stdout).toContain('Please open the following URL in your browser:')
    expect(stdout).toContain('https://auth.checklyhq.com/authorize?')
    expect(stdout).toContain('mode=&allowLogin=true&allowSignUp=false')
    expect(stderr).toBe('')
  }, 15000)

  it('should show URL to signup', async () => {
    const { stdout, stderr } = await runAndKill(fixt, ['login'], {
      delay: 5000,
      promptsInjection: ['signup', false],
      env: {
        CHECKLY_API_KEY: undefined,
        CHECKLY_ACCOUNT_ID: undefined,
      },
    })

    expect(stdout).toContain('Please open the following URL in your browser:')
    expect(stdout).toContain('https://auth.checklyhq.com/authorize?')
    expect(stdout).toContain('mode=signUp&allowLogin=false&allowSignUp=true')
    expect(stderr).toBe('')
  }, 15000)
})
