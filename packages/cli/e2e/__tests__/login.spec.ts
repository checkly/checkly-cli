import { execa } from 'execa'
import * as os from 'node:os'
import * as path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
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
  let home: string
  // Every CLI run in this file gets an isolated home, so the `logout` below
  // and any login that completes never touch the developer's real credentials.
  // Node reads HOME on POSIX and USERPROFILE on Windows; the config store uses
  // XDG_CONFIG_HOME / APPDATA.
  const isolatedHome = () => ({
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    CHECKLY_NO_BROWSER: '1',
  })

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
    home = await mkdtemp(path.join(os.tmpdir(), 'checkly-login-e2e-'))
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
    await rm(home, { recursive: true, force: true })
  })

  beforeEach(async () => {
    try {
      await runCheckly(fixt, ['logout'], {
        promptsInjection: [true],
        timeout: 5000,
        env: isolatedHome(),
      })
    } catch {
      // logout may fail if not logged in, that's fine
    }
  })

  it('should show warning with environment variables are configured', async () => {
    const { stderr } = await runCheckly(fixt, ['login'], {
      timeout: 5000,
      env: isolatedHome(),
    })
    expect(stderr).toContain('`CHECKLY_API_KEY`')
    expect(stderr).toContain('environment variables')
    expect(stderr).toContain('are configured (via shell or .env file)')
  }, 10000)

  // With the Device Code grant enabled on the Auth0 client, login prints an
  // activation URL and a short code and waits; there is no login/sign-up menu
  // (the hosted page offers both) and no localhost callback.
  it('should show the device-flow activation URL and code', async () => {
    const { stdout, stderr } = await runAndKill(fixt, ['login'], {
      delay: 8000,
      env: {
        ...isolatedHome(),
        CHECKLY_API_KEY: undefined,
        CHECKLY_ACCOUNT_ID: undefined,
      },
    })

    expect(stdout).toContain('Visit https://auth.checklyhq.com/activate and enter the code')
    expect(stdout).toMatch(/[A-Z0-9]{4}-[A-Z0-9]{4}/)
    expect(stdout).toContain('Waiting for you to finish in the browser')
    expect(stdout).not.toContain('Do you want to log in or sign up')
    expect(stderr).toBe('')
  }, 20000)

  it('in agent mode prints a machine-readable action_required line and no prompts', async () => {
    const { stdout, stderr } = await runAndKill(fixt, ['login'], {
      delay: 8000,
      env: {
        ...isolatedHome(),
        CHECKLY_CLI_MODE: 'agent',
        CHECKLY_API_KEY: undefined,
        CHECKLY_ACCOUNT_ID: undefined,
      },
    })

    const lines = stdout.split('\n').filter(line => line.trim() !== '')
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const first = JSON.parse(lines[0]!)
    expect(first).toMatchObject({
      status: 'action_required',
      reason: 'login',
      userActionRequired: true,
    })
    expect(first.verification_uri).toMatch(/^https:\/\/auth\.checklyhq\.com\//)
    expect(first.message).toBeTruthy()
    // Nothing interactive leaked into the agent's output.
    expect(stdout).not.toContain('Do you want to')
    expect(stderr).toBe('')
  }, 20000)
})
