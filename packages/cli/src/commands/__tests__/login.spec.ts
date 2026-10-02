import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('open', () => ({ default: vi.fn() }))
vi.mock('prompts', () => ({ default: vi.fn() }))
vi.mock('../../helpers/cli-mode', () => ({ detectCliMode: vi.fn() }))
vi.mock('../../rest/api', () => ({
  accounts: { getAll: vi.fn() },
  user: { get: vi.fn() },
  validateAuthentication: vi.fn(),
}))
vi.mock('../../services/config', () => ({
  default: {
    hasEnvVarsConfigured: vi.fn(),
    hasValidCredentials: vi.fn(),
    getApiKey: vi.fn(),
    getAccountId: vi.fn(),
    auth: { set: vi.fn() },
    data: { set: vi.fn(), get: vi.fn() },
  },
}))
vi.mock('../../auth/device-flow', async importOriginal => {
  const actual = await importOriginal<typeof import('../../auth/device-flow.js')>()
  return {
    ...actual,
    DeviceFlow: vi.fn(),
  }
})
vi.mock('../../auth/api-key', () => ({ credentialsFromTokens: vi.fn() }))
vi.mock('../../auth/index', () => ({ AuthContext: vi.fn() }))

import open from 'open'
import prompts from 'prompts'
import { detectCliMode } from '../../helpers/cli-mode.js'
import * as api from '../../rest/api.js'
import config from '../../services/config.js'
import { DeviceFlow, DeviceFlowError, DeviceFlowNotAllowedError } from '../../auth/device-flow.js'
import { credentialsFromTokens } from '../../auth/api-key.js'
import { AuthContext } from '../../auth/index.js'
import Login from '../login.js'

const mockConfig = {
  version: '1.0.0',
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand (...argv: string[]) {
  const cmd = new Login(argv, mockConfig)
  cmd.log = vi.fn() as any
  cmd.warn = vi.fn() as any
  cmd.exit = vi.fn((code: number) => {
    throw new Error(`EXIT_${code}`)
  }) as any
  return cmd
}

const authorization = {
  deviceCode: 'dev-code',
  userCode: 'ABCD-EFGH',
  verificationUri: 'https://auth.checklyhq.com/activate',
  verificationUriComplete: 'https://auth.checklyhq.com/activate?user_code=ABCD-EFGH',
  expiresAt: 0,
  intervalMs: 5_000,
}

const deviceFlow = {
  requestAuthorization: vi.fn(),
  pollForTokens: vi.fn(),
}

const authContext = {
  authenticationUrl: 'https://auth.checklyhq.com/authorize?client_id=x',
  getAuth0Credentials: vi.fn(),
}

function loggedLines (cmd: Login): string[] {
  return vi.mocked(cmd.log).mock.calls.map(([msg]) => String(msg ?? ''))
}

function jsonLines (cmd: Login): any[] {
  return loggedLines(cmd).map(line => JSON.parse(line))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(DeviceFlow).mockImplementation(() => deviceFlow as any)
  vi.mocked(AuthContext).mockImplementation(() => authContext as any)
  deviceFlow.requestAuthorization.mockResolvedValue({ ...authorization, expiresAt: Date.now() + 900_000 })
  deviceFlow.pollForTokens.mockResolvedValue({ accessToken: 'at', idToken: 'idt' })
  vi.mocked(credentialsFromTokens).mockResolvedValue({ name: 'Ada Lovelace', key: 'cak_1' })
  authContext.getAuth0Credentials.mockResolvedValue({ name: 'Ada Lovelace', key: 'cak_pkce' })
  vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(false)
  vi.mocked(config.hasValidCredentials).mockReturnValue(false)
  vi.mocked(config.getApiKey).mockReturnValue('')
  vi.mocked(config.getAccountId).mockReturnValue('')
  vi.mocked(api.user.get).mockResolvedValue({ data: { id: 'u1', name: 'Ada Lovelace' } } as any)
  vi.mocked(api.accounts.getAll).mockResolvedValue({ data: [{ id: 'acc-1', name: 'Acme' }] } as any)
  vi.mocked(api.validateAuthentication).mockResolvedValue({ id: 'acc-1', name: 'Acme' } as any)
  vi.mocked(open).mockResolvedValue({} as any)
  vi.mocked(prompts).mockResolvedValue({})
})

describe('checkly login', () => {
  describe('agent mode', () => {
    beforeEach(() => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
    })

    it('runs the device flow without prompts and prints action_required then success as JSON', async () => {
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(prompts).not.toHaveBeenCalled()
      const [actionRequired, success] = jsonLines(cmd)
      expect(actionRequired).toMatchObject({
        status: 'action_required',
        reason: 'login',
        userActionRequired: true,
        verification_uri: 'https://auth.checklyhq.com/activate',
        verification_uri_complete: 'https://auth.checklyhq.com/activate?user_code=ABCD-EFGH',
        user_code: 'ABCD-EFGH',
      })
      expect(actionRequired.message).toContain('ABCD-EFGH')
      expect(actionRequired.expires_in).toBeGreaterThan(0)
      expect(success).toEqual({
        success: true,
        user: 'Ada Lovelace',
        accountId: 'acc-1',
        accountName: 'Acme',
        accounts: [{ id: 'acc-1', name: 'Acme' }],
      })
      expect(loggedLines(cmd)).toHaveLength(2)

      expect(config.auth.set).toHaveBeenCalledWith('apiKey', 'cak_1')
      expect(config.data.set).toHaveBeenCalledWith('accountId', 'acc-1')
      expect(config.data.set).toHaveBeenCalledWith('accountName', 'Acme')
      expect(api.validateAuthentication).toHaveBeenCalled()
    })

    it('opens the browser as a best effort and keeps going when that fails', async () => {
      vi.mocked(open).mockRejectedValueOnce(new Error('no display'))
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(open).toHaveBeenCalledWith('https://auth.checklyhq.com/activate?user_code=ABCD-EFGH')
      expect(jsonLines(cmd)[1].success).toBe(true)
    })

    it('selects the account given by --account-id when the user has several', async () => {
      vi.mocked(api.accounts.getAll).mockResolvedValue({
        data: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
      } as any)
      const cmd = createCommand('--account-id', 'acc-2')
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(prompts).not.toHaveBeenCalled()
      expect(jsonLines(cmd)[1]).toMatchObject({ accountId: 'acc-2', accountName: 'Globex' })
    })

    it('with several accounts and no --account-id stores the key but asks the agent to select one', async () => {
      vi.mocked(api.accounts.getAll).mockResolvedValue({
        data: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
      } as any)
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_1')

      expect(config.auth.set).toHaveBeenCalledWith('apiKey', 'cak_1')
      expect(config.data.set).not.toHaveBeenCalled()
      expect(api.validateAuthentication).not.toHaveBeenCalled()

      const [login, select] = jsonLines(cmd)
      expect(login.status).toBe('action_required')
      expect(select).toMatchObject({
        status: 'action_required',
        reason: 'select_account',
        userActionRequired: false,
        user: 'Ada Lovelace',
        accounts: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
      })
      expect(select.next[0].command).toBe('npx checkly login --account-id <id>')
      expect(loggedLines(cmd)).toHaveLength(2)
    })

    it('resumes a login that has a key but no account: selects with --account-id, no new authentication', async () => {
      vi.mocked(config.getApiKey).mockReturnValue('cak_stored')
      vi.mocked(api.accounts.getAll).mockResolvedValue({
        data: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
      } as any)
      const cmd = createCommand('--account-id', 'acc-2')
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
      expect(AuthContext).not.toHaveBeenCalled()
      expect(config.auth.set).not.toHaveBeenCalled()
      expect(config.data.set).toHaveBeenCalledWith('accountId', 'acc-2')
      expect(jsonLines(cmd)).toEqual([{
        success: true,
        user: 'Ada Lovelace',
        accountId: 'acc-2',
        accountName: 'Globex',
        accounts: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
      }])
    })

    it('resumes and asks again when the key is stored but still no account is chosen', async () => {
      vi.mocked(config.getApiKey).mockReturnValue('cak_stored')
      vi.mocked(api.accounts.getAll).mockResolvedValue({
        data: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
      } as any)
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_1')

      expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
      const [select] = jsonLines(cmd)
      expect(select).toMatchObject({ status: 'action_required', reason: 'select_account' })
      expect(loggedLines(cmd)).toHaveLength(1)
    })

    it('fails with a JSON error when --account-id does not match any account', async () => {
      const cmd = createCommand('--account-id', 'nope')
      await expect(cmd.run()).rejects.toThrow('EXIT_1')

      const last = jsonLines(cmd).at(-1)
      expect(last.success).toBe(false)
      expect(last.error).toContain('nope')
    })

    it('reports an existing login as JSON without starting a new flow', async () => {
      vi.mocked(config.hasValidCredentials).mockReturnValue(true)
      vi.mocked(config.data.get).mockImplementation((key: string) => ({ accountId: 'acc-1', accountName: 'Acme' })[key])
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
      expect(jsonLines(cmd)).toEqual([{ success: true, alreadyLoggedIn: true, accountId: 'acc-1', accountName: 'Acme' }])
    })

    it('prints a JSON error and exits 1 when the login code expires', async () => {
      deviceFlow.pollForTokens.mockRejectedValueOnce(new DeviceFlowError('expired_token', 'The login code expired.'))
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_1')

      const lines = jsonLines(cmd)
      expect(lines[0].status).toBe('action_required')
      expect(lines[1]).toEqual({ success: false, error: 'The login code expired.' })
    })

    it('falls back to the browser-callback flow when the device grant is not enabled, still without prompts', async () => {
      deviceFlow.requestAuthorization.mockRejectedValueOnce(new DeviceFlowNotAllowedError('not allowed'))
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(prompts).not.toHaveBeenCalled()
      expect(AuthContext).toHaveBeenCalledWith('any')
      const [actionRequired, success] = jsonLines(cmd)
      expect(actionRequired).toMatchObject({
        status: 'action_required',
        userActionRequired: true,
        verification_uri: 'https://auth.checklyhq.com/authorize?client_id=x',
      })
      expect(actionRequired.user_code).toBeUndefined()
      expect(actionRequired.message).toContain('same machine')
      expect(success).toMatchObject({ success: true, accountId: 'acc-1' })
      expect(config.auth.set).toHaveBeenCalledWith('apiKey', 'cak_pkce')
    })
  })

  describe('ci mode', () => {
    it('does not start a login flow and explains how to authenticate', async () => {
      vi.mocked(detectCliMode).mockReturnValue('ci')
      const cmd = createCommand()
      cmd.error = vi.fn((msg: any) => {
        throw new Error(String(msg))
      }) as any

      await expect(cmd.run()).rejects.toThrow(/CHECKLY_API_KEY/)
      expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
      expect(prompts).not.toHaveBeenCalled()
    })
  })

  describe('interactive mode', () => {
    beforeEach(() => {
      vi.mocked(detectCliMode).mockReturnValue('interactive')
    })

    it('shows the verification URL and code, opens the browser and skips the login/sign-up menu', async () => {
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      const output = loggedLines(cmd).join('\n')
      expect(output).toContain('https://auth.checklyhq.com/activate')
      expect(output).toContain('ABCD-EFGH')
      expect(output).toContain('Successfully logged in as')
      expect(open).toHaveBeenCalledWith('https://auth.checklyhq.com/activate?user_code=ABCD-EFGH')
      // No login/sign-up menu, no "open a browser?" question, single account => no account prompt.
      expect(prompts).not.toHaveBeenCalled()
      expect(config.auth.set).toHaveBeenCalledWith('apiKey', 'cak_1')
    })

    it('asks which account to use when there are several', async () => {
      vi.mocked(api.accounts.getAll).mockResolvedValue({
        data: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
      } as any)
      vi.mocked(prompts).mockResolvedValueOnce({ selectedAccount: { id: 'acc-2', name: 'Globex' } })
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(prompts).toHaveBeenCalledTimes(1)
      expect(config.data.set).toHaveBeenCalledWith('accountId', 'acc-2')
    })

    it('keeps the existing menu-driven flow when the device grant is not enabled', async () => {
      deviceFlow.requestAuthorization.mockRejectedValueOnce(new DeviceFlowNotAllowedError('not allowed'))
      vi.mocked(prompts)
        .mockResolvedValueOnce({ mode: 'signup' })
        .mockResolvedValueOnce({ openUrl: false })
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(AuthContext).toHaveBeenCalledWith('signup')
      expect(loggedLines(cmd).join('\n')).toContain('https://auth.checklyhq.com/authorize?client_id=x')
      expect(open).not.toHaveBeenCalled()
      expect(config.auth.set).toHaveBeenCalledWith('apiKey', 'cak_pkce')
    })

    it('resumes a login that has a key but no account by asking which account to use', async () => {
      vi.mocked(config.getApiKey).mockReturnValue('cak_stored')
      vi.mocked(api.accounts.getAll).mockResolvedValue({
        data: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
      } as any)
      vi.mocked(prompts).mockResolvedValueOnce({ selectedAccount: { id: 'acc-1', name: 'Acme' } })
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
      expect(prompts).toHaveBeenCalledTimes(1)
      expect(config.data.set).toHaveBeenCalledWith('accountId', 'acc-1')
      expect(loggedLines(cmd).join('\n')).toContain('Successfully logged in as Ada Lovelace')
    })

    it('lets the user keep the current login', async () => {
      vi.mocked(config.hasValidCredentials).mockReturnValue(true)
      vi.mocked(prompts).mockResolvedValueOnce({ setNewkey: false })
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
    })
  })

  describe('browser opening', () => {
    afterEach(() => {
      delete process.env.CHECKLY_NO_BROWSER
    })

    it('does not open a browser with --no-browser but still shows the URL and code', async () => {
      vi.mocked(detectCliMode).mockReturnValue('interactive')
      const cmd = createCommand('--no-browser')
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(open).not.toHaveBeenCalled()
      expect(loggedLines(cmd).join('\n')).toContain('ABCD-EFGH')
    })

    it('does not open a browser when CHECKLY_NO_BROWSER is set, in agent mode too', async () => {
      process.env.CHECKLY_NO_BROWSER = '1'
      vi.mocked(detectCliMode).mockReturnValue('agent')
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(open).not.toHaveBeenCalled()
      expect(jsonLines(cmd)[0].status).toBe('action_required')
    })
  })

  it('warns and exits when credentials come from environment variables, in every mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(true)
    const cmd = createCommand()
    await expect(cmd.run()).rejects.toThrow('EXIT_0')

    expect(cmd.warn).toHaveBeenCalledWith(expect.stringContaining('CHECKLY_API_KEY'))
    expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
  })
})
