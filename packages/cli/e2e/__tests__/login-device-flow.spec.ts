import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execa } from 'execa'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'

// Drives `checkly login` in a real process through the whole device flow:
// device code -> user approves -> tokens -> Checkly API key -> account. Auth0
// and the Checkly API are replaced by a local server so this runs anywhere
// and can approve the code without a person logging in to a real account.

interface Seen {
  method: string
  url: string
}

function fakeJwt (payload: Record<string, unknown>): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`
}

interface FakeServers {
  baseUrl: string
  seen: Seen[]
  /** Whether the user has approved the device code; the token endpoint answers pending until then. */
  approved: boolean
  /** How many device codes have been issued; each gets its own user code. */
  issuedCodes: number
  close: () => Promise<void>
}

function startFakeServers (): Promise<FakeServers> {
  const seen: Seen[] = []

  const server = http.createServer((req, res) => {
    const url = req.url ?? ''
    seen.push({ method: req.method ?? '', url })
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

    if (req.method === 'POST' && url === '/oauth/device/code') {
      // A new code for every request, as the real server does, so a test
      // notices when the CLI asks for a new code instead of reusing its own.
      // Auth0's 15-minute lifetime: slow CI runners take well over a minute
      // for the several CLI runs a test makes against one code.
      fake.issuedCodes += 1
      const userCode = `WXYZ-${1000 + fake.issuedCodes}`
      return json(200, {
        device_code: `device-e2e-${fake.issuedCodes}`,
        user_code: userCode,
        verification_uri: `${base}/activate`,
        verification_uri_complete: `${base}/activate?user_code=${userCode}`,
        expires_in: 900,
        interval: 1,
      })
    }
    if (req.method === 'POST' && url === '/oauth/token') {
      if (!fake.approved) return json(403, { error: 'authorization_pending' })
      return json(200, { access_token: 'access-e2e', id_token: fakeJwt({ name: 'Ada Lovelace' }) })
    }
    if (req.method === 'GET' && url === '/users/me') return json(200, { id: 'user-e2e' })
    if (req.method === 'GET' && url === '/next/users/me') return json(200, { id: 'user-e2e', name: 'Ada Lovelace', email: 'ada@example.com' })
    if (req.method === 'POST' && url.startsWith('/users/me/api-keys')) return json(200, { key: 'cak_e2e' })
    if (req.method === 'GET' && url === '/next/accounts') {
      return json(200, [{ id: 'acc-e2e', name: 'E2E Account' }, { id: 'acc-other', name: 'Other' }])
    }
    if (req.method === 'GET' && url === '/next/accounts/acc-e2e') {
      return json(200, { id: 'acc-e2e', name: 'E2E Account', runtimeId: '2024.02', features: [] })
    }
    if (req.method === 'GET' && url === '/next/accounts/acc-other') {
      return json(200, { id: 'acc-other', name: 'Other', runtimeId: '2024.02', features: [] })
    }
    return json(404, { error: 'not_found', url })
  })

  const fake: FakeServers = {
    baseUrl: '',
    seen,
    approved: false,
    issuedCodes: 0,
    close: () => new Promise(done => server.close(() => done())),
  }
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      fake.baseUrl = `http://127.0.0.1:${port}`
      resolve(fake)
    })
  })
}

describe('login with the device flow (fake Auth0 + API)', () => {
  let fixt: FixtureSandbox
  let fake: FakeServers
  let home: string

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
    fake = await startFakeServers()
    // The first CLI start in a fresh sandbox is slow on Windows runners; do it
    // outside the timed tests.
    await execa(fixt.abspath('node_modules/.bin/checkly'), ['--version'], { cwd: fixt.root, reject: false, timeout: 120_000 })
  }, 300_000)

  afterAll(async () => {
    await fake?.close()
    await fixt?.destroy()
  })

  async function runLogin (args: string[], env: Record<string, string>) {
    // Isolated home: the CLI stores credentials under the user's config
    // directory, and this must never touch the developer's real login.
    home = await mkdtemp(path.join(os.tmpdir(), 'checkly-login-e2e-'))
    return runLoginInHome(home, args, env)
  }

  function runLoginInHome (homeDir: string, args: string[], env: Record<string, string>) {
    // Node reads HOME on POSIX but USERPROFILE on Windows, and the config
    // store uses XDG_CONFIG_HOME / APPDATA, so all of them point at the temp dir.
    return execa(fixt.abspath('node_modules/.bin/checkly'), args, {
      cwd: fixt.root,
      extendEnv: false,
      reject: false,
      timeout: 120_000,
      // No stdin: an unexpected prompt must fail fast instead of hanging.
      stdin: 'ignore',
      env: {
        PATH: process.env.PATH,
        HOME: homeDir,
        USERPROFILE: homeDir,
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        XDG_CONFIG_HOME: path.join(homeDir, '.config'),
        SystemRoot: process.env.SystemRoot,
        CHECKLY_ENV: 'local',
        CHECKLY_API_URL: fake.baseUrl,
        CHECKLY_AUTH_URL: fake.baseUrl,
        CHECKLY_NO_BROWSER: '1',
        CHECKLY_E2E_CLI_VERSION: '4.8.0',
        CHECKLY_E2E_DISABLE_FANCY_OUTPUT: '1',
        ...env,
      },
    })
  }

  async function storedFile (name: 'auth' | 'config'): Promise<Record<string, unknown> | undefined> {
    // conf writes <configDir>/@checkly/cli-local/<name>.json; find it wherever the platform put it.
    const candidates = [
      path.join(home, 'Library', 'Preferences', '@checkly', 'cli-local', `${name}.json`),
      path.join(home, '.config', '@checkly', 'cli-local', `${name}.json`),
      path.join(home, 'AppData', 'Roaming', '@checkly', 'cli-local', 'Config', `${name}.json`),
    ]
    for (const file of candidates) {
      try {
        return JSON.parse(await readFile(file, 'utf8'))
      } catch {
        // try next
      }
    }
    return undefined
  }

  async function storedApiKey (): Promise<string | undefined> {
    return (await storedFile('auth'))?.apiKey as string | undefined
  }

  /** An error as one line: oclif wraps long ones and prefixes the continuations with `›`. */
  function oneLine (output: string): string {
    return output.replace(/\s*›\s*/g, ' ').replace(/\s+/g, ' ')
  }

  /** Runs `body` with a `.env` in the project, as a project that pins its account would have. */
  async function withDotenv (content: string, body: () => Promise<void>): Promise<void> {
    const file = path.join(fixt.root, '.env')
    await writeFile(file, content)
    try {
      await body()
    } finally {
      await rm(file, { force: true })
    }
  }

  function jsonLines (output: string): any[] {
    return output.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line))
  }

  it('agent mode: prints the code and returns, collects the approval on a later run, then asks which account to use', async () => {
    fake.seen.length = 0
    fake.approved = false
    const started = await runLogin(['login'], { CHECKLY_CLI_MODE: 'agent' })

    // Returns at once with the code: an agent sees output only when the command exits.
    expect(started.stderr).toBe('')
    expect(started.exitCode).toBe(1)
    const [actionRequired] = jsonLines(started.stdout)
    expect(jsonLines(started.stdout)).toHaveLength(1)
    const userCode = actionRequired.user_code
    expect(userCode).toMatch(/^WXYZ-\d{4}$/)
    expect(actionRequired).toMatchObject({
      status: 'action_required',
      reason: 'login_required',
      userActionRequired: true,
      verification_uri: `${fake.baseUrl}/activate`,
      verification_uri_complete: `${fake.baseUrl}/activate?user_code=${userCode}`,
    })
    expect(fake.seen.map(s => `${s.method} ${s.url}`)).not.toContain('POST /oauth/token')

    // Run again before the user approved: the same code, no new one.
    fake.seen.length = 0
    const waiting = await runLoginInHome(home, ['login'], { CHECKLY_CLI_MODE: 'agent' })
    expect(waiting.exitCode).toBe(1)
    expect(jsonLines(waiting.stdout)).toEqual([expect.objectContaining({ status: 'action_required', user_code: userCode })])
    expect(fake.seen.map(s => `${s.method} ${s.url}`)).not.toContain('POST /oauth/device/code')

    // The user approves; the next run stores the key and, with two accounts
    // and no --account-id, does not guess.
    fake.approved = true
    fake.seen.length = 0
    const approved = await runLoginInHome(home, ['login'], { CHECKLY_CLI_MODE: 'agent' })
    expect(approved.stderr).toBe('')
    expect(approved.exitCode).toBe(1)
    expect(jsonLines(approved.stdout)).toEqual([expect.objectContaining({
      status: 'action_required',
      reason: 'select_account',
      userActionRequired: true,
      user: 'Ada Lovelace',
      choices: [{ id: 'acc-e2e', name: 'E2E Account' }, { id: 'acc-other', name: 'Other' }],
      next: [
        { command: 'npx checkly login --account-id <id>', when: 'to make the account the default' },
        { command: 'CHECKLY_ACCOUNT_ID=<id> npx checkly <command>', when: 'to use the account for this command only' },
      ],
    })])
    const urls = fake.seen.map(s => `${s.method} ${decodeURIComponent(s.url)}`)
    expect(urls.filter(u => u === 'POST /oauth/token')).toHaveLength(1)
    expect(urls).toContain('GET /users/me')
    expect(urls.some(u => u.startsWith('POST /users/me/api-keys?name=CLI User Key')), urls.join('\n')).toBe(true)
    expect(urls).toContain('GET /next/accounts')
    expect(await storedApiKey()).toBe('cak_e2e')

    // Resume with the same home: pick the account without a second authentication.
    fake.seen.length = 0
    const resumed = await runLoginInHome(home, ['login', '--account-id', 'acc-e2e'], { CHECKLY_CLI_MODE: 'agent' })
    expect(resumed.stderr).toBe('')
    expect(resumed.exitCode).toBe(0)
    expect(jsonLines(resumed.stdout)[0]).toMatchObject({
      status: 'success',
      reason: 'logged_in',
      accountId: 'acc-e2e',
      accountName: 'E2E Account',
    })
    const resumedUrls = fake.seen.map(s => `${s.method} ${s.url}`)
    expect(resumedUrls).not.toContain('POST /oauth/device/code')
    expect(resumedUrls).not.toContain('POST /oauth/token')
    expect(resumedUrls).toContain('GET /next/accounts/acc-e2e')
    await rm(home, { recursive: true, force: true })
  }, 180_000)

  it('agent mode: `login --wait` returns once the user approves, without being told', async () => {
    fake.approved = false
    const started = await runLogin(['login', '--account-id', 'acc-e2e'], { CHECKLY_CLI_MODE: 'agent' })
    expect(started.exitCode).toBe(1)
    const [actionRequired] = jsonLines(started.stdout)
    expect(actionRequired.next).toEqual([{
      command: 'npx checkly login --wait --account-id acc-e2e',
      when: 'right after relaying the code; returns once the user has approved',
    }])

    // The agent runs the wait right away; the user approves a moment later.
    const waiting = runLoginInHome(home, ['login', '--wait', '--account-id', 'acc-e2e'], { CHECKLY_CLI_MODE: 'agent' })
    setTimeout(() => {
      fake.approved = true
    }, 2_000)
    const approved = await waiting
    expect(approved.stderr).toBe('')
    expect(approved.exitCode).toBe(0)
    expect(jsonLines(approved.stdout)).toEqual([expect.objectContaining({
      status: 'success',
      reason: 'logged_in',
      accountId: 'acc-e2e',
    })])
    expect(await storedApiKey()).toBe('cak_e2e')
    await rm(home, { recursive: true, force: true })
  }, 180_000)

  it('runs one command against another account with CHECKLY_ACCOUNT_ID, keeping the stored choice', async () => {
    fake.approved = true
    const loggedIn = await runLogin(['login', '--account-id', 'acc-e2e'], { CHECKLY_CLI_MODE: 'interactive' })
    expect(loggedIn.exitCode, loggedIn.stderr).toBe(0)

    const other = await runLoginInHome(home, ['whoami'], { CHECKLY_CLI_MODE: 'agent', CHECKLY_ACCOUNT_ID: 'acc-other' })
    expect(other.exitCode, other.stderr).toBe(0)
    expect(other.stdout).toContain('You are currently on account "Other" (acc-other) as Ada Lovelace.')
    expect(other.stdout).toContain('Other accounts: "E2E Account" (acc-e2e)')
    expect(other.stdout).toContain('Default account: "E2E Account" (acc-e2e)')

    const again = await runLoginInHome(home, ['whoami'], { CHECKLY_CLI_MODE: 'agent' })
    expect(again.stdout).toContain('You are currently on account "E2E Account" (acc-e2e)')
    await rm(home, { recursive: true, force: true })
  }, 180_000)

  it('a project .env with CHECKLY_ACCOUNT_ID: a fresh machine logs in and uses that account, storing no default', async () => {
    await withDotenv('CHECKLY_ACCOUNT_ID=acc-other\n', async () => {
      fake.approved = false
      const started = await runLogin(['whoami'], { CHECKLY_CLI_MODE: 'agent' })
      // Not "`CHECKLY_API_KEY` is not set": the variable only picks an account for a login.
      expect(jsonLines(started.stderr)).toEqual([expect.objectContaining({ reason: 'login_required' })])
      expect(started.exitCode).toBe(1)

      fake.approved = true
      const waited = await runLoginInHome(home, ['login', '--wait'], { CHECKLY_CLI_MODE: 'agent' })
      // The variable names the account, so there is nothing to ask and no default to store.
      expect(waited.exitCode, waited.stderr).toBe(0)
      expect(jsonLines(waited.stdout)).toEqual([expect.objectContaining({
        status: 'success', reason: 'logged_in', accountId: 'acc-other',
      })])

      const again = await runLoginInHome(home, ['whoami'], { CHECKLY_CLI_MODE: 'agent' })
      expect(again.exitCode, again.stderr).toBe(0)
      expect(again.stdout).toContain('You are currently on account "Other" (acc-other) as Ada Lovelace.')
      expect(again.stdout).toContain('Default account: none (not needed while `CHECKLY_ACCOUNT_ID` picks the account)')
      expect((await storedFile('config'))?.accountId).toBeUndefined()
    })
    await rm(home, { recursive: true, force: true })
  }, 180_000)

  it('a command started under CHECKLY_ACCOUNT_ID logs in inline and runs against that account', async () => {
    fake.approved = true
    home = await mkdtemp(path.join(os.tmpdir(), 'checkly-login-e2e-'))
    const first = await runLoginInHome(home, ['whoami'], { CHECKLY_CLI_MODE: 'agent', CHECKLY_ACCOUNT_ID: 'acc-other' })
    expect(jsonLines(first.stderr)[0]).toMatchObject({ reason: 'login_required' })
    const second = await runLoginInHome(home, ['whoami'], { CHECKLY_CLI_MODE: 'agent', CHECKLY_ACCOUNT_ID: 'acc-other' })
    expect(second.exitCode, second.stderr).toBe(0)
    expect(jsonLines(second.stderr)).toEqual([expect.objectContaining({
      status: 'success',
      reason: 'logged_in',
      accountId: 'acc-other',
      message: expect.stringContaining('no default account is stored'),
    })])
    expect(second.stdout).toContain('You are currently on account "Other" (acc-other)')
    expect((await storedFile('config'))?.accountId).toBeUndefined()
    await rm(home, { recursive: true, force: true })
  }, 180_000)

  it('CHECKLY_ACCOUNT_ID naming an account the login does not have lists the ones it has', async () => {
    fake.approved = true
    const loggedIn = await runLogin(['login', '--account-id', 'acc-e2e'], { CHECKLY_CLI_MODE: 'interactive' })
    expect(loggedIn.exitCode, loggedIn.stderr).toBe(0)

    const typo = await runLoginInHome(home, ['whoami'], { CHECKLY_CLI_MODE: 'agent', CHECKLY_ACCOUNT_ID: 'acc-typo' })
    expect(typo.exitCode).not.toBe(0)
    expect(oneLine(typo.stderr)).toContain('Account "acc-typo" from `CHECKLY_ACCOUNT_ID` is not available with your login.')
    expect(oneLine(typo.stderr)).toContain('E2E Account (acc-e2e), Other (acc-other)')
    await rm(home, { recursive: true, force: true })
  }, 180_000)

  it('CI with CHECKLY_ACCOUNT_ID but no key names both ways to authenticate instead of starting a login', async () => {
    fake.seen.length = 0
    const ci = await runLogin(['whoami'], { CHECKLY_CLI_MODE: 'ci', CHECKLY_ACCOUNT_ID: 'acc-e2e' })
    expect(ci.exitCode).not.toBe(0)
    expect(oneLine(ci.stderr)).toContain('`CHECKLY_ACCOUNT_ID` is set, but there is no `checkly login` session to use it with.')
    expect(oneLine(ci.stderr)).toContain('set `CHECKLY_API_KEY` as well')
    expect(fake.seen.map(s => s.url)).not.toContain('/oauth/device/code')
    await rm(home, { recursive: true, force: true })
  }, 180_000)

  it('interactive mode: shows the URL and code without any prompt and confirms the login', async () => {
    fake.approved = true
    const { stdout, stderr, exitCode } = await runLogin(['login', '--account-id', 'acc-e2e'], { CHECKLY_CLI_MODE: 'interactive' })

    expect(stderr).toBe('')
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`Visit ${fake.baseUrl.replace(/^https?:\/\//, '')}/activate and enter WXYZ-`)
    expect(stdout).toMatch(/enter WXYZ-\d{4}/)
    expect(stdout).toContain('Logged in as Ada Lovelace to ')
    expect(stdout).not.toContain('Do you want to')
    await rm(home, { recursive: true, force: true })
  }, 180_000)

  it('an authenticated command without credentials logs in inline in agent mode and stops at account selection', async () => {
    fake.seen.length = 0
    fake.approved = false
    const started = await runLogin(['whoami'], { CHECKLY_CLI_MODE: 'agent' })

    // Inline, the login writes to stderr: stdout belongs to the command.
    expect(started.stdout).toBe('')
    expect(jsonLines(started.stderr)).toEqual([
      expect.objectContaining({ status: 'action_required', reason: 'login_required', user_code: expect.stringMatching(/^WXYZ-\d{4}$/) }),
    ])
    expect(started.exitCode).toBe(1)

    // After approval, rerunning the command collects the login and stops at account selection.
    fake.approved = true
    const approved = await runLoginInHome(home, ['whoami'], { CHECKLY_CLI_MODE: 'agent' })
    expect(approved.stdout).toBe('')
    expect(jsonLines(approved.stderr)).toEqual([
      expect.objectContaining({ status: 'action_required', reason: 'select_account' }),
    ])
    expect(approved.exitCode).toBe(1)

    // After choosing, the command runs without any further login.
    fake.seen.length = 0
    await runLoginInHome(home, ['login', '--account-id', 'acc-e2e'], { CHECKLY_CLI_MODE: 'agent' })
    const again = await runLoginInHome(home, ['whoami'], { CHECKLY_CLI_MODE: 'agent' })
    expect(again.exitCode, again.stderr).toBe(0)
    expect(again.stdout).toContain('You are currently on account "E2E Account" (acc-e2e) as Ada Lovelace.')
    expect(fake.seen.map(s => s.url)).not.toContain('/oauth/device/code')
    await rm(home, { recursive: true, force: true })
  }, 180_000)
})
