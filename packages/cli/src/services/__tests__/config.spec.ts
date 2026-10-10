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

  describe('getCredentialSource', () => {
    function withStoredKey (apiKey: string | undefined) {
      return vi.spyOn(config, 'auth', 'get').mockReturnValue({ get: () => apiKey } as any)
    }

    afterEach(() => {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    })

    it('is account_override when CHECKLY_ACCOUNT_ID picks an account for the key `checkly login` stored', () => {
      withStoredKey('cak_login')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-2')
      vi.stubEnv('CHECKLY_API_KEY', '')
      expect(config.getCredentialSource()).toBe('account_override')
    })

    it('is environment with CHECKLY_API_KEY set, or with CHECKLY_ACCOUNT_ID and no stored key', () => {
      withStoredKey('cak_login')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-2')
      vi.stubEnv('CHECKLY_API_KEY', 'cu_env')
      expect(config.getCredentialSource()).toBe('environment')

      withStoredKey(undefined)
      vi.stubEnv('CHECKLY_API_KEY', '')
      expect(config.getCredentialSource()).toBe('environment')
    })

    it('is login without credentials in the environment', () => {
      withStoredKey('cak_login')
      vi.stubEnv('CHECKLY_ACCOUNT_ID', '')
      vi.stubEnv('CHECKLY_API_KEY', '')
      expect(config.getCredentialSource()).toBe('login')
    })
  })
})
