import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  validateAuthentication: vi.fn(),
}))
vi.mock('../../services/config', () => ({
  default: { hasValidCredentials: vi.fn(), hasEnvVarsConfigured: vi.fn() },
}))
vi.mock('../../helpers/cli-mode', async importOriginal => ({
  ...await importOriginal<typeof import('../../helpers/cli-mode.js')>(),
  detectCliMode: vi.fn(),
}))
vi.mock('../login', () => ({ default: vi.fn() }))

import * as api from '../../rest/api.js'
import config from '../../services/config.js'
import { detectCliMode } from '../../helpers/cli-mode.js'
import Login from '../login.js'
import { BaseCommand } from '../baseCommand.js'
import { AuthCommand } from '../authCommand.js'

class Probe extends AuthCommand {
  async run (): Promise<void> {}

  get didLogInInline (): boolean {
    return this.loggedInInline
  }
}

const mockConfig = {
  version: '1.0.0',
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

const loginInstance = { login: vi.fn() }

function createCommand () {
  const cmd = new Probe([], mockConfig)
  cmd.log = vi.fn() as any
  cmd.logToStderr = vi.fn() as any
  cmd.exit = vi.fn((code: number) => {
    throw new Error(`EXIT_${code}`)
  }) as any
  return cmd
}

let baseInitSpy: ReturnType<typeof vi.spyOn>
const originalIsTTY = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY }

function setTTY (isTTY: boolean) {
  process.stdin.isTTY = isTTY
  process.stdout.isTTY = isTTY
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.CHECKLY_SKIP_AUTH
  baseInitSpy = vi.spyOn(BaseCommand.prototype, 'init').mockResolvedValue(undefined)
  vi.mocked(Login).mockImplementation(() => loginInstance as any)
  loginInstance.login.mockResolvedValue(true)
  vi.mocked(api.validateAuthentication).mockResolvedValue({ id: 'acc-1', name: 'Acme', features: [] } as any)
  vi.mocked(config.hasValidCredentials).mockReturnValue(false)
  vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(false)
  setTTY(true)
})

afterEach(() => {
  baseInitSpy.mockRestore()
  process.stdin.isTTY = originalIsTTY.stdin
  process.stdout.isTTY = originalIsTTY.stdout
})

describe('AuthCommand.init without stored credentials', () => {
  it('starts the login flow inline in agent mode and then validates authentication', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const cmd = createCommand()

    await cmd.init()

    expect(Login).toHaveBeenCalledWith([], mockConfig)
    // Inline: login writes to stderr, keeping the command's stdout machine-readable.
    expect(loginInstance.login).toHaveBeenCalledWith({ inline: true })
    expect(api.validateAuthentication).toHaveBeenCalledTimes(1)
    expect(cmd.log).not.toHaveBeenCalled()
    expect(cmd.logToStderr).not.toHaveBeenCalled()
    expect(cmd.account).toMatchObject({ id: 'acc-1' })
    expect(cmd.didLogInInline).toBe(true)
  })

  it('passes the command\'s fancy-output setting to the inline login', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const cmd = createCommand()
    cmd.fancy = false

    await cmd.init()

    expect((loginInstance as any).fancy).toBe(false)
  })

  it('tells a human what is happening and starts the login flow in interactive mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    const cmd = createCommand()

    await cmd.init()

    expect(loginInstance.login).toHaveBeenCalledWith({ inline: true })
    expect(cmd.log).not.toHaveBeenCalled()
    expect(vi.mocked(cmd.logToStderr).mock.calls.join('\n')).toMatch(/log in/i)
    expect(api.validateAuthentication).toHaveBeenCalledTimes(1)
  })

  it('does not start a login flow in CI and leaves the existing error to authentication', async () => {
    vi.mocked(detectCliMode).mockReturnValue('ci')
    vi.mocked(api.validateAuthentication).mockRejectedValue(new Error('Run `npx checkly login` or set `CHECKLY_API_KEY`'))
    const cmd = createCommand()

    await expect(cmd.init()).rejects.toThrow('CHECKLY_API_KEY')
    expect(loginInstance.login).not.toHaveBeenCalled()
  })

  it('does not start a login flow in interactive mode without a terminal', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    setTTY(false)
    vi.mocked(api.validateAuthentication).mockRejectedValue(new Error('Run `npx checkly login` or set `CHECKLY_API_KEY`'))
    const cmd = createCommand()

    await expect(cmd.init()).rejects.toThrow('CHECKLY_API_KEY')
    expect(loginInstance.login).not.toHaveBeenCalled()
    expect(cmd.log).not.toHaveBeenCalled()
    expect(cmd.logToStderr).not.toHaveBeenCalled()
  })

  it('starts the login flow in agent mode without a terminal', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    setTTY(false)
    const cmd = createCommand()

    await cmd.init()

    expect(loginInstance.login).toHaveBeenCalledTimes(1)
  })

  it('leaves incomplete environment credentials to authentication instead of logging in', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(true)
    vi.mocked(api.validateAuthentication).mockRejectedValue(new Error('`CHECKLY_ACCOUNT_ID` is not set.'))
    const cmd = createCommand()

    await expect(cmd.init()).rejects.toThrow('CHECKLY_ACCOUNT_ID')
    expect(loginInstance.login).not.toHaveBeenCalled()
    expect(cmd.logToStderr).not.toHaveBeenCalled()
  })

  it('exits 1 when the inline login does not complete', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    loginInstance.login.mockResolvedValue(false)
    const cmd = createCommand()

    await expect(cmd.init()).rejects.toThrow('EXIT_1')
    expect(api.validateAuthentication).not.toHaveBeenCalled()
  })
})

describe('AuthCommand.init with credentials', () => {
  it('skips the login flow when credentials are stored', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(config.hasValidCredentials).mockReturnValue(true)
    const cmd = createCommand()

    await cmd.init()

    expect(loginInstance.login).not.toHaveBeenCalled()
    expect(api.validateAuthentication).toHaveBeenCalledTimes(1)
    expect(cmd.didLogInInline).toBe(false)
  })

  it('skips the login flow when CHECKLY_SKIP_AUTH is set', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    process.env.CHECKLY_SKIP_AUTH = '1'
    const cmd = createCommand()

    await cmd.init()

    expect(loginInstance.login).not.toHaveBeenCalled()
  })
})
