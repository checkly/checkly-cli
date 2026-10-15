import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that pull these in
// ---------------------------------------------------------------------------

vi.mock('mqtt', () => ({
  connectAsync: vi.fn(),
}))

vi.mock('../config.js', () => ({
  default: {
    getMqttUrl: vi.fn().mockReturnValue('mqtts://mqtt.checkly.com'),
    getAccountId: vi.fn().mockReturnValue('acc-1'),
    getApiKey: vi.fn().mockReturnValue('api-key'),
  },
}))

vi.mock('../proxy.js', () => ({
  createProxyAgent: vi.fn().mockReturnValue(null),
}))

import { connectAsync } from 'mqtt'
import { SocketClient } from '../socket-client.js'

const mockedConnectAsync = vi.mocked(connectAsync)

describe('SocketClient.connect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retries the MQTT connection with backoff before resolving', async () => {
    const client = { on: vi.fn() }
    mockedConnectAsync
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(client as any)

    const result = await SocketClient.connect()

    expect(result).toBe(client)
    expect(mockedConnectAsync).toHaveBeenCalledTimes(3)
    expect(mockedConnectAsync).toHaveBeenCalledWith(
      'mqtts://mqtt.checkly.com?authenticationScheme=userApiKey',
      expect.objectContaining({ username: 'acc-1', password: 'api-key' }),
      false,
    )
  })

  it('rethrows after the retry limit is exhausted', async () => {
    mockedConnectAsync.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(SocketClient.connect()).rejects.toThrow('ECONNREFUSED')

    // Initial attempt plus 4 retries (retryCount 1-4).
    expect(mockedConnectAsync).toHaveBeenCalledTimes(5)
  })
})
