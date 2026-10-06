import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('open', () => ({ default: vi.fn() }))
vi.mock('prompts', () => ({ default: vi.fn() }))
vi.mock('../../helpers/cli-mode', async importOriginal => ({
  ...await importOriginal<typeof import('../../helpers/cli-mode.js')>(),
  detectCliMode: vi.fn(),
}))
vi.mock('../../rest/api', () => ({
  accounts: { getAll: vi.fn() },
  user: { get: vi.fn() },
  validateAuthentication: vi.fn(),
}))
vi.mock('../../services/config', () => {
  const data = {
    store: {} as Record<string, unknown>,
    set: vi.fn((key: string, value: unknown) => {
      data.store = { ...data.store, [key]: value }
    }),
    get: vi.fn(),
    delete: vi.fn((key: string) => {
      data.store = Object.fromEntries(Object.entries(data.store).filter(([k]) => k !== key))
    }),
  }
  return {
    default: {
      hasEnvVarsConfigured: vi.fn(),
      hasValidCredentials: vi.fn(),
      getApiKey: vi.fn(),
      getAccountId: vi.fn(),
      auth: { set: vi.fn(), delete: vi.fn() },
      data,
    },
  }
})
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
import { UnauthorizedError } from '../../rest/errors.js'
import Login from '../login.js'

const mockConfig = {
  version: '1.0.0',
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand (...argv: string[]) {
  const cmd = new Login(argv, mockConfig)
  cmd.log = vi.fn() as any
  cmd.logToStderr = vi.fn() as any
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

const unauthorized = () => new UnauthorizedError({ statusCode: 401, error: 'Unauthorized', message: 'Unauthorized' } as any)

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
  vi.mocked(config.data.get).mockReset()
  config.data.store = {} as any
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
      expect(select.message).toContain('npx checkly logout')
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

    it('authenticates again when the stored key of an unfinished login is no longer accepted', async () => {
      vi.mocked(config.getApiKey).mockReturnValue('cak_revoked')
      vi.mocked(api.user.get).mockRejectedValueOnce(unauthorized())
      const cmd = createCommand('--account-id', 'acc-1')
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(config.auth.delete).toHaveBeenCalledWith('apiKey')
      expect(deviceFlow.requestAuthorization).toHaveBeenCalled()
      expect(config.auth.set).toHaveBeenCalledWith('apiKey', 'cak_1')
      expect(jsonLines(cmd).at(-1)).toMatchObject({ success: true, accountId: 'acc-1' })
    })

    it('reports other errors of the stored key without deleting it', async () => {
      vi.mocked(config.getApiKey).mockReturnValue('cak_stored')
      vi.mocked(api.user.get).mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      const cmd = createCommand('--account-id', 'acc-1')
      await expect(cmd.run()).rejects.toThrow('EXIT_1')

      expect(config.auth.delete).not.toHaveBeenCalled()
      expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
      expect(jsonLines(cmd).at(-1)).toMatchObject({ success: false, error: 'connect ECONNREFUSED' })
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

    describe('already logged in', () => {
      beforeEach(() => {
        vi.mocked(config.hasValidCredentials).mockReturnValue(true)
        vi.mocked(config.getApiKey).mockReturnValue('cak_stored')
        vi.mocked(config.getAccountId).mockReturnValue('acc-1')
        vi.mocked(config.data.get).mockImplementation((key: string) => ({ accountId: 'acc-1', accountName: 'Acme' })[key])
        config.data.store = { accountId: 'acc-1', accountName: 'Acme' } as any
        vi.mocked(api.accounts.getAll).mockResolvedValue({
          data: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
        } as any)
      })

      it('switches to the account given by --account-id with the stored key', async () => {
        const cmd = createCommand('--account-id', 'acc-2')
        await expect(cmd.run()).rejects.toThrow('EXIT_0')

        expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
        expect(config.auth.set).not.toHaveBeenCalled()
        expect(config.data.set).toHaveBeenCalledWith('accountId', 'acc-2')
        expect(config.data.set).toHaveBeenCalledWith('accountName', 'Globex')
        expect(jsonLines(cmd)).toEqual([expect.objectContaining({ success: true, accountId: 'acc-2', accountName: 'Globex' })])
      })

      it('keeps the current account when --account-id names an unknown one', async () => {
        const cmd = createCommand('--account-id', 'nope')
        await expect(cmd.run()).rejects.toThrow('EXIT_1')

        expect(config.data.set).not.toHaveBeenCalled()
        expect(jsonLines(cmd).at(-1)).toMatchObject({ success: false })
        expect(jsonLines(cmd).at(-1).error).toContain('nope')
        // The account may belong to another identity: say how to get there.
        expect(jsonLines(cmd).at(-1).error).toContain('npx checkly logout')
      })

      it('switches without prompting in interactive mode', async () => {
        vi.mocked(detectCliMode).mockReturnValue('interactive')
        const cmd = createCommand('--account-id', 'acc-2')
        await expect(cmd.run()).rejects.toThrow('EXIT_0')

        expect(prompts).not.toHaveBeenCalled()
        expect(config.data.set).toHaveBeenCalledWith('accountId', 'acc-2')
        expect(loggedLines(cmd).join('\n')).not.toContain('Continuing the login as')
        expect(loggedLines(cmd).join('\n')).toContain('Switched to account')
        expect(loggedLines(cmd).join('\n')).toContain('acc-2')
      })

      it('stays on the current account when the switch cannot be validated', async () => {
        vi.mocked(api.validateAuthentication).mockRejectedValueOnce(new Error('Service Unavailable'))
        const cmd = createCommand('--account-id', 'acc-2')
        await expect(cmd.run()).rejects.toThrow('EXIT_1')

        expect(config.data.store).toEqual({ accountId: 'acc-1', accountName: 'Acme' })
        expect(jsonLines(cmd).at(-1)).toMatchObject({ success: false, error: 'Service Unavailable' })
      })

      it('keeps the stored key and the current account when the key is rejected for the new account', async () => {
        vi.mocked(api.validateAuthentication).mockRejectedValueOnce(
          new Error('Authentication failed with account id "acc-2" and API key "...ored"'))
        const cmd = createCommand('--account-id', 'acc-2')
        await expect(cmd.run()).rejects.toThrow('EXIT_1')

        expect(config.auth.delete).not.toHaveBeenCalled()
        expect(config.data.store).toEqual({ accountId: 'acc-1', accountName: 'Acme' })
        expect(JSON.stringify(jsonLines(cmd))).not.toContain('cak_stored')
      })

      it('authenticates again when switching with a key that is no longer accepted, and says so as a login', async () => {
        vi.mocked(detectCliMode).mockReturnValue('interactive')
        vi.mocked(api.user.get).mockRejectedValueOnce(unauthorized())
        const cmd = createCommand('--account-id', 'acc-2')
        await expect(cmd.run()).rejects.toThrow('EXIT_0')

        const output = loggedLines(cmd).join('\n')
        expect(output).toContain('The stored login is no longer valid')
        expect(output).toContain('Successfully logged in as Ada Lovelace')
        expect(output).not.toContain('Switched to account')

        expect(config.auth.delete).toHaveBeenCalledWith('apiKey')
        expect(deviceFlow.requestAuthorization).toHaveBeenCalled()
        expect(config.data.set).toHaveBeenCalledWith('accountId', 'acc-2')
      })

      it('reports the existing login when --account-id names the current account', async () => {
        const cmd = createCommand('--account-id', 'acc-1')
        await expect(cmd.run()).rejects.toThrow('EXIT_0')

        expect(api.accounts.getAll).not.toHaveBeenCalled()
        expect(jsonLines(cmd)).toEqual([{ success: true, alreadyLoggedIn: true, accountId: 'acc-1', accountName: 'Acme' }])
      })

      it('switches accounts in CI too, since no browser is needed', async () => {
        vi.mocked(detectCliMode).mockReturnValue('ci')
        const cmd = createCommand('--account-id', 'acc-2')
        await expect(cmd.run()).rejects.toThrow('EXIT_0')

        expect(config.data.set).toHaveBeenCalledWith('accountId', 'acc-2')
      })

      it('in CI says the stored login was removed when its key is rejected, without a device flow', async () => {
        vi.mocked(detectCliMode).mockReturnValue('ci')
        vi.mocked(api.user.get).mockRejectedValueOnce(unauthorized())
        const cmd = createCommand('--account-id', 'acc-2')
        await expect(cmd.run()).rejects.toThrow(/no longer valid.*CHECKLY_API_KEY/s)

        expect(config.auth.delete).toHaveBeenCalledWith('apiKey')
        expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
      })
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

  describe('replacing a login', () => {
    it('drops the previous account before storing the new key, so a failure cannot pair them', async () => {
      vi.mocked(detectCliMode).mockReturnValue('interactive')
      vi.mocked(config.hasValidCredentials).mockReturnValue(true)
      vi.mocked(config.getApiKey).mockReturnValue('cak_old')
      vi.mocked(config.getAccountId).mockReturnValue('acc-old')
      vi.mocked(prompts).mockResolvedValueOnce({ setNewkey: true })
      vi.mocked(api.accounts.getAll).mockRejectedValueOnce(new Error('Service Unavailable'))
      const cmd = createCommand()

      await expect(cmd.run()).rejects.toThrow('Service Unavailable')

      expect(config.data.delete).toHaveBeenCalledWith('accountId')
      expect(config.data.delete).toHaveBeenCalledWith('accountName')
      expect(config.auth.set).toHaveBeenCalledWith('apiKey', 'cak_1')
      const deleteOrder = vi.mocked(config.data.delete).mock.invocationCallOrder[0]!
      expect(deleteOrder).toBeLessThan(vi.mocked(config.auth.set).mock.invocationCallOrder[0]!)
    })

    it('does not bring the previous account back when validating the new login fails', async () => {
      vi.mocked(detectCliMode).mockReturnValue('interactive')
      vi.mocked(config.hasValidCredentials).mockReturnValue(true)
      vi.mocked(config.getApiKey).mockReturnValue('cak_old')
      vi.mocked(config.getAccountId).mockReturnValue('acc-old')
      config.data.store = { accountId: 'acc-old', accountName: 'Old' } as any
      vi.mocked(prompts).mockResolvedValueOnce({ setNewkey: true })
      vi.mocked(api.validateAuthentication).mockRejectedValueOnce(new Error('Service Unavailable'))
      const cmd = createCommand()

      await expect(cmd.run()).rejects.toThrow('Service Unavailable')

      expect(config.data.store).toEqual({})
      expect(config.auth.set).toHaveBeenCalledWith('apiKey', 'cak_1')
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

    it('lists the accounts as a plain error when an unfinished login has several and none is given', async () => {
      vi.mocked(detectCliMode).mockReturnValue('ci')
      vi.mocked(config.getApiKey).mockReturnValue('cak_stored')
      vi.mocked(api.accounts.getAll).mockResolvedValue({
        data: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
      } as any)
      const cmd = createCommand()

      await expect(cmd.run()).rejects.toThrow(/Acme \(acc-1\), Globex \(acc-2\).*--account-id/s)
      expect(cmd.log).not.toHaveBeenCalled()
    })

    it('finishes an unfinished login with a still valid stored key, since no browser is needed', async () => {
      vi.mocked(detectCliMode).mockReturnValue('ci')
      vi.mocked(config.getApiKey).mockReturnValue('cak_stored')
      const cmd = createCommand('--account-id', 'acc-1')
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(deviceFlow.requestAuthorization).not.toHaveBeenCalled()
      expect(config.data.set).toHaveBeenCalledWith('accountId', 'acc-1')
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
      expect(loggedLines(cmd).join('\n')).toContain('Continuing the login as')
      expect(loggedLines(cmd).join('\n')).toContain('npx checkly logout')
      expect(loggedLines(cmd).join('\n')).toContain('Successfully logged in as Ada Lovelace')
    })

    it('says so and logs in again when the stored key of an unfinished login is no longer accepted', async () => {
      vi.mocked(config.getApiKey).mockReturnValue('cak_revoked')
      vi.mocked(api.user.get).mockRejectedValueOnce(unauthorized())
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(config.auth.delete).toHaveBeenCalledWith('apiKey')
      expect(deviceFlow.requestAuthorization).toHaveBeenCalled()
      const output = loggedLines(cmd).join('\n')
      expect(output).toContain('The stored login is no longer valid')
      expect(output).not.toContain('Continuing the login as')
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

    it.each(['0', 'false', 'no', 'off', ''])('opens the browser when CHECKLY_NO_BROWSER is %j', async value => {
      process.env.CHECKLY_NO_BROWSER = value
      vi.mocked(detectCliMode).mockReturnValue('agent')
      const cmd = createCommand()
      await expect(cmd.run()).rejects.toThrow('EXIT_0')

      expect(open).toHaveBeenCalled()
    })
  })

  describe('inline login from another command', () => {
    it('writes every line to stderr so the command\'s stdout stays clean', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      const cmd = createCommand()

      await expect(cmd.login({ inline: true })).resolves.toBe(true)

      expect(cmd.log).not.toHaveBeenCalled()
      const lines = vi.mocked(cmd.logToStderr).mock.calls.map(([line]) => JSON.parse(String(line)))
      expect(lines.map(line => line.status ?? line.success)).toEqual(['action_required', true])
    })

    it('writes the failure line to stderr as well', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      deviceFlow.pollForTokens.mockRejectedValueOnce(new DeviceFlowError('access_denied', 'User denied'))
      const cmd = createCommand()

      await expect(cmd.login({ inline: true })).resolves.toBe(false)

      expect(cmd.log).not.toHaveBeenCalled()
      const last = JSON.parse(String(vi.mocked(cmd.logToStderr).mock.calls.at(-1)![0]))
      expect(last).toMatchObject({ success: false, error: 'User denied' })
    })

    it('writes the interactive lines to stderr too', async () => {
      vi.mocked(detectCliMode).mockReturnValue('interactive')
      const cmd = createCommand()

      await expect(cmd.login({ inline: true })).resolves.toBe(true)

      expect(cmd.log).not.toHaveBeenCalled()
      expect(vi.mocked(cmd.logToStderr).mock.calls.join('\n')).toContain('ABCD-EFGH')
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
