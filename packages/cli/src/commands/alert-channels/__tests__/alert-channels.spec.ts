import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../rest/api', () => ({
  alertChannels: { getAllPaginated: vi.fn(), get: vi.fn() },
  alertNotifications: { getAll: vi.fn() },
}))

import * as api from '../../../rest/api.js'
import AlertChannelsList from '../list.js'
import AlertChannelsGet from '../get.js'
import AlertChannelsLogs from '../logs.js'

function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    style: { outputFormat: undefined, longError: vi.fn() },
    logged,
  }
}

const alertChannelFixture = {
  id: 123,
  type: 'EMAIL',
  config: { address: 'alerts@example.com' },
  subscriptions: [],
  sendRecovery: true,
  sendFailure: true,
  sendDegraded: false,
  sslExpiry: false,
  sslExpiryThreshold: 30,
  autoSubscribe: false,
  created_at: '2026-03-01T10:00:00.000Z',
  updated_at: '2026-03-02T10:00:00.000Z',
}

const alertLogFixture = {
  id: 'log-1',
  type: 'EMAIL',
  status: 'SUCCESS',
  notificationResult: 'sent',
  timestamp: '2026-03-01T10:00:00.000Z',
  checkType: 'API',
  checkId: 'chk-1',
  checkName: 'Homepage API',
  checkAlertId: 'alert-1',
  alertChannelId: 123,
  checkResultId: 'result-1',
}

describe('alert-channels commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.alertChannels.getAllPaginated).mockResolvedValue({
      alertChannels: [alertChannelFixture],
      total: 37,
      page: 2,
      limit: 10,
    } as any)
    vi.mocked(api.alertChannels.get).mockResolvedValue(alertChannelFixture as any)
    vi.mocked(api.alertNotifications.getAll).mockResolvedValue({
      data: [alertLogFixture],
      total: 37,
      page: 2,
      limit: 10,
    } as any)
  })

  it('list -o json returns raw channel data with pagination metadata', async () => {
    const ctx = createCommandContext({
      flags: { limit: 10, page: 2, output: 'json' },
    })

    await AlertChannelsList.prototype.run.call(ctx as any)

    expect(api.alertChannels.getAllPaginated).toHaveBeenCalledWith({ limit: 10, page: 2 })
    expect(JSON.parse(ctx.logged[0])).toEqual({
      data: [alertChannelFixture],
      pagination: { page: 2, limit: 10, total: 37, totalPages: 4 },
    })
  })

  it('get <id> -o json returns raw channel JSON', async () => {
    const ctx = createCommandContext({
      args: { id: '123' },
      flags: { output: 'json' },
    })

    await AlertChannelsGet.prototype.run.call(ctx as any)

    expect(api.alertChannels.get).toHaveBeenCalledWith(123)
    expect(JSON.parse(ctx.logged[0])).toEqual(alertChannelFixture)
  })

  it('get <id> includes navigation hints in terminal output', async () => {
    const ctx = createCommandContext({
      args: { id: '123' },
      flags: { output: 'detail' },
    })

    await AlertChannelsGet.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('checkly alert-channels logs 123')
    expect(ctx.logged[0]).toContain('checkly alert-channels list')
  })

  it('logs <id> --status failed --from <ts> --to <ts> sends expected query params', async () => {
    const ctx = createCommandContext({
      args: { id: '123' },
      flags: {
        limit: 10,
        page: 2,
        from: 1772359200,
        to: 1772445600,
        status: 'failed',
        output: 'table',
      },
    })

    await AlertChannelsLogs.prototype.run.call(ctx as any)

    expect(api.alertNotifications.getAll).toHaveBeenCalledWith({
      alertChannelId: 123,
      limit: 10,
      page: 2,
      from: 1772359200,
      to: 1772445600,
      hasFailures: true,
    })
  })

  it('logs <id> -o json includes pagination metadata', async () => {
    const ctx = createCommandContext({
      args: { id: '123' },
      flags: {
        limit: 10,
        page: 2,
        from: undefined,
        to: undefined,
        status: undefined,
        output: 'json',
      },
    })

    await AlertChannelsLogs.prototype.run.call(ctx as any)

    expect(JSON.parse(ctx.logged[0])).toEqual({
      data: [alertLogFixture],
      pagination: { page: 2, limit: 10, total: 37, totalPages: 4 },
    })
  })

  it('all alert channel commands are read-only and idempotent', () => {
    expect(AlertChannelsList.readOnly).toBe(true)
    expect(AlertChannelsList.destructive).toBe(false)
    expect(AlertChannelsList.idempotent).toBe(true)
    expect(AlertChannelsGet.readOnly).toBe(true)
    expect(AlertChannelsGet.destructive).toBe(false)
    expect(AlertChannelsGet.idempotent).toBe(true)
    expect(AlertChannelsLogs.readOnly).toBe(true)
    expect(AlertChannelsLogs.destructive).toBe(false)
    expect(AlertChannelsLogs.idempotent).toBe(true)
  })
})
