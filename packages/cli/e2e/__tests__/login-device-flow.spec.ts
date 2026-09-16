import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { execa } from 'execa'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'

// Drives `checkly login` in a real process through the whole device flow:
// device code -> user approves -> tokens -> Checkly API key -> account. Auth0
// and the Checkly API are replaced by a local server so this runs anywhere
// and, unlike the real tenant today, has the device_code grant enabled.

interface Seen {
  method: string
  url: string
}

function fakeJwt (payload: Record<string, unknown>): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`
}

function startFakeServers (): Promise<{ baseUrl: string, seen: Seen[], close: () => Promise<void> }> {
  const seen: Seen[] = []
  let tokenPolls = 0

  const server = http.createServer((req, res) => {
    const url = req.url ?? ''
    seen.push({ method: req.method ?? '', url })
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

    if (req.method === 'POST' && url === '/oauth/device/code') {
      return json(200, {
        device_code: 'device-e2e',
        user_code: 'WXYZ-1234',
        verification_uri: `${base}/activate`,
        verification_uri_complete: `${base}/activate?user_code=WXYZ-1234`,
        expires_in: 60,
        interval: 1,
      })
    }
    if (req.method === 'POST' && url === '/oauth/token') {
      tokenPolls += 1
      if (tokenPolls === 1) return json(403, { error: 'authorization_pending' })
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
    return json(404, { error: 'not_found', url })
  })

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        seen,
        close: () => new Promise(done => server.close(() => done())),
      })
    })
  })
}

describe('login with the device flow (fake Auth0 + API)', () => {
  let fixt: FixtureSandbox
  let fake: Awaited<ReturnType<typeof startFakeServers>>
  let home: string

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
    fake = await startFakeServers()
  }, 180_000)

  afterAll(async () => {
    await fake?.close()
    await fixt?.destroy()
  })

  async function runLogin (args: string[], env: Record<string, string>) {
    // Isolated HOME: the CLI stores credentials under the home directory, and
    // this must never touch the developer's real login.
    home = await mkdtemp(path.join(os.tmpdir(), 'checkly-login-e2e-'))
    try {
      return await execa(fixt.abspath('node_modules/.bin/checkly'), args, {
        cwd: fixt.root,
        extendEnv: false,
        reject: false,
        timeout: 30_000,
        env: {
          PATH: process.env.PATH,
          HOME: home,
          XDG_CONFIG_HOME: path.join(home, '.config'),
          CHECKLY_ENV: 'local',
          CHECKLY_API_URL: fake.baseUrl,
          CHECKLY_AUTH_URL: fake.baseUrl,
          CHECKLY_NO_BROWSER: '1',
          CHECKLY_E2E_CLI_VERSION: '4.8.0',
          CHECKLY_E2E_DISABLE_FANCY_OUTPUT: '1',
          ...env,
        },
      })
    } finally {
      // keep `home` for assertions; cleaned in the test
    }
  }

  async function storedApiKey (): Promise<string | undefined> {
    // conf writes <configDir>/@checkly/cli-local/auth.json; find it wherever the platform put it.
    const candidates = [
      path.join(home, 'Library', 'Preferences', '@checkly', 'cli-local', 'auth.json'),
      path.join(home, '.config', '@checkly', 'cli-local', 'auth.json'),
      path.join(home, 'AppData', 'Roaming', '@checkly', 'cli-local', 'Config', 'auth.json'),
    ]
    for (const file of candidates) {
      try {
        return JSON.parse(await readFile(file, 'utf8')).apiKey
      } catch {
        // try next
      }
    }
    return undefined
  }

  it('agent mode: prints action_required with the code, waits for approval, stores the key and reports the account', async () => {
    fake.seen.length = 0
    const { stdout, stderr, exitCode } = await runLogin(['login'], { CHECKLY_CLI_MODE: 'agent' })

    expect(stderr).toBe('')
    expect(exitCode).toBe(0)

    const lines = stdout.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      status: 'action_required',
      reason: 'login',
      userActionRequired: true,
      user_code: 'WXYZ-1234',
      verification_uri: `${fake.baseUrl}/activate`,
      verification_uri_complete: `${fake.baseUrl}/activate?user_code=WXYZ-1234`,
    })
    expect(lines[1]).toEqual({
      success: true,
      user: 'Ada Lovelace',
      accountId: 'acc-e2e',
      accountName: 'E2E Account',
      accounts: [{ id: 'acc-e2e', name: 'E2E Account' }, { id: 'acc-other', name: 'Other' }],
    })

    const urls = fake.seen.map(s => `${s.method} ${decodeURIComponent(s.url)}`)
    expect(urls[0], urls.join('\n')).toBe('POST /oauth/device/code')
    expect(urls.filter(u => u === 'POST /oauth/token')).toHaveLength(2)
    expect(urls).toContain('GET /users/me')
    expect(urls.some(u => u.startsWith('POST /users/me/api-keys?name=CLI User Key')), urls.join('\n')).toBe(true)
    expect(urls).toContain('GET /next/accounts')
    expect(urls).toContain('GET /next/accounts/acc-e2e')

    expect(await storedApiKey()).toBe('cak_e2e')
    await rm(home, { recursive: true, force: true })
  }, 60_000)

  it('interactive mode: shows the URL and code without any prompt and confirms the login', async () => {
    const { stdout, stderr, exitCode } = await runLogin(['login', '--account-id', 'acc-e2e'], { CHECKLY_CLI_MODE: 'interactive' })

    expect(stderr).toBe('')
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`${fake.baseUrl}/activate`)
    expect(stdout).toContain('WXYZ-1234')
    expect(stdout).toContain('Successfully logged in as Ada Lovelace')
    expect(stdout).not.toContain('Do you want to')
    await rm(home, { recursive: true, force: true })
  }, 60_000)

  it('an authenticated command without credentials logs in inline in agent mode', async () => {
    fake.seen.length = 0
    const { stdout, stderr, exitCode } = await runLogin(['whoami'], { CHECKLY_CLI_MODE: 'agent' })

    const lines = stdout.split('\n').filter(line => line.trim() !== '')
    expect(JSON.parse(lines[0]!)).toMatchObject({ status: 'action_required', user_code: 'WXYZ-1234' })
    expect(JSON.parse(lines[1]!)).toMatchObject({ success: true, accountId: 'acc-e2e' })
    expect(exitCode, `stderr: ${stderr}\nrequests: ${fake.seen.map(s => `${s.method} ${s.url}`).join(', ')}`).toBe(0)
    // whoami's own output follows the login lines
    expect(lines.slice(2).join('\n')).toContain('You are currently on account "E2E Account" (acc-e2e) as Ada Lovelace.')
    await rm(home, { recursive: true, force: true })
  }, 60_000)
})
