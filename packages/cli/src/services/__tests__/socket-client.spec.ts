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
import { MqttConnectionError, SocketClient } from '../socket-client.js'

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

  it('throws an MqttConnectionError after the retry limit is exhausted', async () => {
    const original = new Error('ECONNREFUSED')
    mockedConnectAsync.mockRejectedValue(original)

    const error = await SocketClient.connect().catch(err => err)

    expect(error).toBeInstanceOf(MqttConnectionError)
    expect(error.message).toContain('Details: ECONNREFUSED')
    expect(error.cause).toBe(original)
    // Initial attempt plus 4 retries (retryCount 1-4).
    expect(mockedConnectAsync).toHaveBeenCalledTimes(5)
  })

  it('describes an AggregateError with an empty message by its inner errors', async () => {
    mockedConnectAsync.mockRejectedValue(Object.assign(new AggregateError([
      new Error('connect ECONNREFUSED ::1:443'),
      new Error('connect ECONNREFUSED 127.0.0.1:443'),
    ], ''), { code: 'ECONNREFUSED' }))

    await expect(SocketClient.connect()).rejects.toThrow(
      'Details: connect ECONNREFUSED ::1:443; connect ECONNREFUSED 127.0.0.1:443',
    )
  })

  it('falls back to the error name and code when there is no message', async () => {
    mockedConnectAsync.mockRejectedValue(Object.assign(new Error(''), { code: 'ECONNRESET' }))

    await expect(SocketClient.connect()).rejects.toThrow('Details: Error (ECONNRESET)')
  })
})
