import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))
vi.mock('../api-key', () => ({ credentialsFromTokens: vi.fn() }))

import * as net from 'node:net'
import axios from 'axios'
import { credentialsFromTokens } from '../api-key.js'
import { AuthContext } from '../index.js'

const signals = ['SIGTERM', 'SIGHUP', 'SIGINT'] as const

function listenerCounts () {
  return signals.map(signal => process.listenerCount(signal))
}

function isListening (): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect(4242, 'localhost')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

// Something else on port 4242 would look like the callback server, so a
// failure to start (EADDRINUSE) must win the race.
async function waitForListening (credentials: Promise<unknown>) {
  const started = (async () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await isListening()) return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('callback server did not start')
  })()
  await Promise.race([started, credentials.then(() => {
    throw new Error('login settled before the server was ready')
  })])
}

describe('AuthContext callback server', () => {
  let baseline: number[]

  beforeEach(() => {
    vi.clearAllMocks()
    baseline = listenerCounts()
    vi.mocked(axios.post).mockResolvedValue({ data: { access_token: 'at', id_token: 'idt' } })
    vi.mocked(credentialsFromTokens).mockResolvedValue({ name: 'Ada Lovelace', key: 'cak_1' })
  })

  // Settles the login if a test failed before doing so, so the server never
  // outlives the test on its fixed port.
  async function release (state: string) {
    if (await isListening()) {
      await fetch(`http://localhost:4242/?code=cleanup&state=${encodeURIComponent(state)}`).catch(() => {})
    }
  }

  it('answers every request and leaves nothing running once the code arrives', async () => {
    const context = new AuthContext('login')
    const state = new URL(context.authenticationUrl).searchParams.get('state')!

    const credentials = context.getAuth0Credentials()
    credentials.catch(() => {})
    try {
      await waitForListening(credentials)
      // Signals keep Node's default behaviour: no handler is installed.
      expect(listenerCounts()).toEqual(baseline)

      // Browsers ask for a favicon; an unanswered request would hold its
      // connection, and with it the process, open.
      const favicon = await fetch('http://localhost:4242/favicon.ico')
      expect(favicon.status).toBe(404)
      const svg = await fetch('http://localhost:4242/missing.svg')
      expect(svg.status).toBe(404)

      const response = await fetch(`http://localhost:4242/?code=the-code&state=${encodeURIComponent(state)}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('connection')).toBe('close')
      await response.text()

      await expect(credentials).resolves.toEqual({ name: 'Ada Lovelace', key: 'cak_1' })
      expect(await isListening()).toBe(false)
      expect(listenerCounts()).toEqual(baseline)
    } finally {
      await release(state)
    }
  })

  it('fails the login and stops listening when the callback reports an error', async () => {
    const context = new AuthContext('login')
    const state = new URL(context.authenticationUrl).searchParams.get('state')!

    const credentials = context.getAuth0Credentials()
    credentials.catch(() => {})
    try {
      await waitForListening(credentials)

      // A request that does not answer this login is ignored.
      await (await fetch('http://localhost:4242/?error=access_denied&state=other')).text()
      expect(await isListening()).toBe(true)

      const query = `error=access_denied&error_description=%3Cb%3EUser%20denied&state=${encodeURIComponent(state)}`
      const response = await fetch(`http://localhost:4242/?${query}`)
      expect(response.headers.get('connection')).toBe('close')
      expect(await response.text()).toContain('&#60;b&#62;User denied')

      await expect(credentials).rejects.toThrow('Login failed: <b>User denied')
      expect(await isListening()).toBe(false)
      expect(axios.post).not.toHaveBeenCalled()
    } finally {
      await release(state)
    }
  })

  it('gives up after the timeout, also dropping connections the browser keeps open', async () => {
    const context = new AuthContext('login', { timeoutMs: 300 })
    const state = new URL(context.authenticationUrl).searchParams.get('state')!

    const credentials = context.getAuth0Credentials()
    credentials.catch(() => {})
    try {
      await waitForListening(credentials)
      // An idle connection a browser would keep alive after loading the login page.
      const socket = net.connect(4242, 'localhost')
      const socketClosed = new Promise(resolve => socket.once('close', resolve))
      socket.on('error', () => {})

      await expect(credentials).rejects.toThrow('The login was not completed in time')
      await socketClosed
      expect(await isListening()).toBe(false)
    } finally {
      await release(state)
    }
  })
})
