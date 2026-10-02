import Conf from 'conf'
import { describe, it, expect, vi } from 'vitest'

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
})
