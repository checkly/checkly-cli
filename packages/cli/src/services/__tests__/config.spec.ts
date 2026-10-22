import Conf from 'conf'
import { afterEach, describe, it, expect, vi } from 'vitest'

import config from '../config.js'
vi.mock('conf')

describe('config', () => {
  it('should avoid reading config file if environment variables are set', () => {
    process.env.CHECKLY_API_KEY = 'test-api-key'
    const apiKey = config.getApiKey()
    expect(apiKey).toEqual(process.env.CHECKLY_API_KEY)
    expect(Conf).toHaveBeenCalledTimes(0)
    delete process.env.CHECKLY_API_KEY
  })

  it('should let CHECKLY_MQTT_URL override the events endpoint in the local environment', () => {
    process.env.CHECKLY_ENV = 'local'
    expect(config.getMqttUrl()).toEqual('wss://events-local.checklyhq.com')
    process.env.CHECKLY_MQTT_URL = 'ws://localhost:8085/mqtt'
    expect(config.getMqttUrl()).toEqual(process.env.CHECKLY_MQTT_URL)
    delete process.env.CHECKLY_MQTT_URL
    delete process.env.CHECKLY_ENV
  })

  it('should let CHECKLY_AUTH_URL override the auth endpoint in the local environment only', () => {
    expect(config.getAuthUrl()).toEqual('https://auth.checklyhq.com')
    process.env.CHECKLY_AUTH_URL = 'http://127.0.0.1:4711'
    expect(config.getAuthUrl()).toEqual('https://auth.checklyhq.com')
    process.env.CHECKLY_ENV = 'local'
    expect(config.getAuthUrl()).toEqual('http://127.0.0.1:4711')
    delete process.env.CHECKLY_AUTH_URL
    expect(config.getAuthUrl()).toEqual('https://auth.checklyhq.com')
    delete process.env.CHECKLY_ENV
  })

  describe('getStoredAccount', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    function withStore (store: Record<string, string>) {
      vi.spyOn(config, 'data', 'get').mockReturnValue({ get: (key: string) => store[key] } as any)
    }

    it('returns the stored default with its name, falling back to the id', () => {
      withStore({ accountId: 'acc-1', accountName: 'Acme' })
      expect(config.getStoredAccount()).toEqual({ id: 'acc-1', name: 'Acme' })

      withStore({ accountId: 'acc-1' })
      expect(config.getStoredAccount()).toEqual({ id: 'acc-1', name: 'acc-1' })
    })

    it('returns nothing without a stored default', () => {
      withStore({})
      expect(config.getStoredAccount()).toBeUndefined()
    })
  })

  describe('getCredentialSource', () => {
    function withStoredKey (apiKey: string | undefined) {
      return vi.spyOn(config, 'auth', 'get').mockReturnValue({ get: () => apiKey } as any)
    }

    afterEach(() => {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    })

    it('is account_override when only CHECKLY_ACCOUNT_ID is set, with or without a stored login', () => {
      vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-2')
      vi.stubEnv('CHECKLY_API_KEY', '')
      withStoredKey('cak_login')
      expect(config.getCredentialSource()).toBe('account_override')

      // The login comes next; the variable then picks its account.
      withStoredKey(undefined)
      expect(config.getCredentialSource()).toBe('account_override')
    })

    it('is environment whenever CHECKLY_API_KEY is set', () => {
      withStoredKey('cak_login')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-2')
      vi.stubEnv('CHECKLY_API_KEY', 'cu_env')
      expect(config.getCredentialSource()).toBe('environment')

      vi.stubEnv('CHECKLY_ACCOUNT_ID', '')
      expect(config.getCredentialSource()).toBe('environment')
    })

    it('is login without credentials in the environment', () => {
      withStoredKey('cak_login')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', '')
      vi.stubEnv('CHECKLY_API_KEY', '')
      expect(config.getCredentialSource()).toBe('login')
    })
  })

  describe('pinEnvironment', () => {
    // A fresh module per test, so a pin never leaks into other tests.
    async function freshConfig (store: { apiKey?: string, accountId?: string } = {}) {
      vi.resetModules()
      const { default: fresh } = await import('../config.js')
      vi.spyOn(fresh, 'auth', 'get').mockReturnValue({ get: () => store.apiKey } as any)
      vi.spyOn(fresh, 'data', 'get').mockReturnValue({ get: (key: string) => (store as any)[key] } as any)
      return fresh
    }

    afterEach(() => {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    })

    it('keeps the credential variables from the time of pinning', async () => {
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      vi.stubEnv('CHECKLY_API_KEY', 'cu_env')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-1')
      const fresh = await freshConfig()
      fresh.pinEnvironment()

      vi.stubEnv('CHECKLY_API_KEY', 'cu_other')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-2')
      expect(fresh.getApiKey()).toBe('cu_env')
      expect(fresh.getAccountId()).toBe('acc-1')
      expect(fresh.getCredentialSource()).toBe('environment')

      delete process.env.CHECKLY_API_KEY
      delete process.env.CHECKLY_ACCOUNT_ID
      expect(fresh.getApiKey()).toBe('cu_env')
      expect(fresh.getAccountId()).toBe('acc-1')
      expect(fresh.getCredentialSource()).toBe('environment')
      expect(stderr).toHaveBeenCalledTimes(2)
    })

    it('keeps variables unset at the time of pinning unset, while stored values stay live', async () => {
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      delete process.env.CHECKLY_API_KEY
      delete process.env.CHECKLY_ACCOUNT_ID
      const store: { apiKey?: string, accountId?: string } = { apiKey: 'cak_login', accountId: 'acc-1' }
      const fresh = await freshConfig(store)
      fresh.pinEnvironment()

      vi.stubEnv('CHECKLY_API_KEY', 'cu_env')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-2')
      expect(fresh.getCredentialSource()).toBe('login')
      expect(fresh.getApiKey()).toBe('cak_login')
      expect(fresh.getAccountId()).toBe('acc-1')

      // `checkly switch` stores a new default during the run.
      store.accountId = 'acc-3'
      expect(fresh.getAccountId()).toBe('acc-3')

      const warnings = stderr.mock.calls.map(([message]) => String(message))
      expect(warnings).toHaveLength(2)
      expect(warnings.some(w => w.includes('`CHECKLY_ACCOUNT_ID` changed') && w.includes('"acc-1"'))).toBe(true)
      expect(warnings.some(w => w.includes('`CHECKLY_API_KEY` changed'))).toBe(true)
      expect(warnings.join('')).not.toContain('cu_env')
      expect(warnings.join('')).not.toContain('cak_login')
    })

    it('keeps API requests on the pinned credentials and endpoint', async () => {
      vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      vi.stubEnv('CHECKLY_API_KEY', 'cu_env')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-1')
      vi.stubEnv('CHECKLY_ENV', 'production')
      const fresh = await freshConfig()
      const { getDefaults } = await import('../../rest/api.js')
      fresh.pinEnvironment()

      vi.stubEnv('CHECKLY_API_KEY', 'cu_other')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-2')
      vi.stubEnv('CHECKLY_ENV', 'local')
      vi.stubEnv('CHECKLY_API_URL', 'http://127.0.0.1:4000')
      vi.stubEnv('CHECKLY_MQTT_URL', 'ws://127.0.0.1:4001')
      expect(getDefaults()).toMatchObject({
        accountId: 'acc-1',
        Authorization: 'Bearer cu_env',
        baseURL: 'https://api.checklyhq.com',
      })
      expect(fresh.getMqttUrl()).toBe('wss://events.checklyhq.com')
    })

    it('does not warn while the variables are unchanged', async () => {
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      vi.stubEnv('CHECKLY_API_KEY', '')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-1')
      const fresh = await freshConfig({ apiKey: 'cak_login' })
      fresh.pinEnvironment()

      // An empty value counts as unset, as it does before pinning.
      delete process.env.CHECKLY_API_KEY
      expect(fresh.getApiKey()).toBe('cak_login')
      expect(fresh.getAccountId()).toBe('acc-1')
      expect(fresh.getCredentialSource()).toBe('account_override')
      expect(stderr).not.toHaveBeenCalled()
    })
  })
})
