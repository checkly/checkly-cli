import net from 'node:net'

import { ExecaError } from 'execa'
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

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

  afterEach(async () => {
    // The login command starts a local HTTP server on port 4242 to receive
    // the OAuth callback. When the test times out, execa kills the process,
    // but the OS may not release the port immediately. Wait until we can
    // bind the port before letting the next test start.
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 5000
      const check = () => {
        if (Date.now() > deadline) return reject(new Error('Port 4242 not released'))
        const server = net.createServer()
        server.once('error', () => setTimeout(check, 200))
        server.once('listening', () => server.close(resolve))
        server.listen(4242)
      }
      check()
    })
  })

  it('should show warning with environment variables are configured', async () => {
    const { stderr } = await runCheckly(fixt, ['login'], {
      timeout: 5000,
    })
    expect(stderr).toContain('Warning: `CHECKLY_API_KEY` or `CHECKLY_ACCOUNT_ID` environment variables')
    expect(stderr).toContain('are configured. You must delete them to use `npx checkly login`.')
  }, 10000)

  it('should show URL to login', async () => {
    try {
      await runCheckly(fixt, ['login'], {
        promptsInjection: ['login', false],
        timeout: 5000,
        env: {
          CHECKLY_API_KEY: undefined,
          CHECKLY_ACCOUNT_ID: undefined,
        },
      })
      expect.unreachable('Expected command to fail due to timeout')
    } catch (err) {
      if (err instanceof ExecaError) {
        const { stdout, stderr } = err

        expect(stdout).toContain('Please open the following URL in your browser:')
        expect(stdout).toContain('https://auth.checklyhq.com/authorize?')
        // URL should allow to login
        expect(stdout).toContain('mode=&allowLogin=true&allowSignUp=false')

        expect(stderr).toBe('')
      } else {
        throw err
      }
    }
  })

  it('should show URL to signup', async () => {
    try {
      await runCheckly(fixt, ['login'], {
        promptsInjection: ['signup', false],
        timeout: 5000,
        env: {
          CHECKLY_API_KEY: undefined,
          CHECKLY_ACCOUNT_ID: undefined,
        },
      })
      expect.unreachable('Expected command to fail due to timeout')
    } catch (err) {
      if (err instanceof ExecaError) {
        const { stdout, stderr } = err

        expect(stdout).toContain('Please open the following URL in your browser:')
        expect(stdout).toContain('https://auth.checklyhq.com/authorize?')
        // URL should allow to signup
        expect(stdout).toContain('mode=signUp&allowLogin=false&allowSignUp=true')

        expect(stderr).toBe('')
      } else {
        throw err
      }
    }
  })
})
