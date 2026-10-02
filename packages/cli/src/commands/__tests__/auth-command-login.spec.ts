import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  validateAuthentication: vi.fn(),
}))
vi.mock('../../services/config', () => ({
  default: { hasValidCredentials: vi.fn() },
}))
vi.mock('../../helpers/cli-mode', () => ({ detectCliMode: vi.fn() }))
vi.mock('../login', () => ({ default: vi.fn() }))

import * as api from '../../rest/api.js'
import config from '../../services/config.js'
import { detectCliMode } from '../../helpers/cli-mode.js'
import Login from '../login.js'
import { BaseCommand } from '../baseCommand.js'
import { AuthCommand } from '../authCommand.js'

class Probe extends AuthCommand {
  async run (): Promise<void> {}
}

const mockConfig = {
  version: '1.0.0',
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

const loginInstance = { login: vi.fn() }

function createCommand () {
  const cmd = new Probe([], mockConfig)
  cmd.log = vi.fn() as any
  cmd.exit = vi.fn((code: number) => {
    throw new Error(`EXIT_${code}`)
  }) as any
  return cmd
}

let baseInitSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.CHECKLY_SKIP_AUTH
  baseInitSpy = vi.spyOn(BaseCommand.prototype, 'init').mockResolvedValue(undefined)
  vi.mocked(Login).mockImplementation(() => loginInstance as any)
  loginInstance.login.mockResolvedValue(true)
  vi.mocked(api.validateAuthentication).mockResolvedValue({ id: 'acc-1', name: 'Acme', features: [] } as any)
  vi.mocked(config.hasValidCredentials).mockReturnValue(false)
})

afterEach(() => {
  baseInitSpy.mockRestore()
})

describe('AuthCommand.init without stored credentials', () => {
  it('starts the login flow inline in agent mode and then validates authentication', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const cmd = createCommand()

    await cmd.init()

    expect(Login).toHaveBeenCalledWith([], mockConfig)
    expect(loginInstance.login).toHaveBeenCalledTimes(1)
    expect(api.validateAuthentication).toHaveBeenCalledTimes(1)
    // Agent output must stay machine-readable: login itself prints the JSON lines.
    expect(cmd.log).not.toHaveBeenCalled()
    expect(cmd.account).toMatchObject({ id: 'acc-1' })
  })

  it('tells a human what is happening and starts the login flow in interactive mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    const cmd = createCommand()

    await cmd.init()

    expect(loginInstance.login).toHaveBeenCalledTimes(1)
    expect(vi.mocked(cmd.log).mock.calls.join('\n')).toMatch(/log in/i)
    expect(api.validateAuthentication).toHaveBeenCalledTimes(1)
  })

  it('does not start a login flow in CI and leaves the existing error to authentication', async () => {
    vi.mocked(detectCliMode).mockReturnValue('ci')
    vi.mocked(api.validateAuthentication).mockRejectedValue(new Error('Run `npx checkly login` or set `CHECKLY_API_KEY`'))
    const cmd = createCommand()

    await expect(cmd.init()).rejects.toThrow('CHECKLY_API_KEY')
    expect(loginInstance.login).not.toHaveBeenCalled()
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
  })

  it('skips the login flow when CHECKLY_SKIP_AUTH is set', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    process.env.CHECKLY_SKIP_AUTH = '1'
    const cmd = createCommand()

    await cmd.init()

    expect(loginInstance.login).not.toHaveBeenCalled()
  })
})
