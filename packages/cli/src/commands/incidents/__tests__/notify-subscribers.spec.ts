import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StatusPage } from '../../../rest/status-pages'

vi.mock('../../../rest/api', () => ({
  statusPages: {
    get: vi.fn(),
  },
  incidents: {
    create: vi.fn(),
    createUpdate: vi.fn(),
    update: vi.fn(),
  },
}))

import * as api from '../../../rest/api'
import IncidentsCreate from '../create'
import IncidentsUpdate from '../update'
import IncidentsResolve from '../resolve'

const statusPageFixture: StatusPage = {
  id: 'sp-1',
  name: 'Status Page',
  url: 'status.example.com',
  customDomain: null,
  isPrivate: false,
  defaultTheme: 'light',
  cards: [{
    id: 'card-1',
    name: 'Core Services',
    services: [{
      id: 'svc-1',
      name: 'Checkout API',
      accountId: 'acc-1',
    }],
  }],
  created_at: '2026-02-25T10:00:00.000Z',
  updated_at: '2026-02-25T10:00:00.000Z',
}

function createCommandContext (parsed: unknown) {
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn(),
    style: {
      outputFormat: 'table',
      longError: vi.fn(),
    },
  }
}

describe('incidents notify-subscribers flags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined

    vi.mocked(api.statusPages.get).mockResolvedValue(statusPageFixture)
    vi.mocked(api.incidents.create).mockResolvedValue({ id: 'inc-1' } as any)
    vi.mocked(api.incidents.createUpdate).mockResolvedValue({ id: 'upd-1' } as any)
    vi.mocked(api.incidents.update).mockResolvedValue({ id: 'inc-1', severity: 'CRITICAL' } as any)
  })

  it('defines notify-subscribers defaults and allowNo across commands', () => {
    expect((IncidentsCreate.flags['notify-subscribers'] as any).default).toBe(true)
    expect((IncidentsCreate.flags['notify-subscribers'] as any).allowNo).toBe(true)

    expect((IncidentsUpdate.flags['notify-subscribers'] as any).default).toBe(true)
    expect((IncidentsUpdate.flags['notify-subscribers'] as any).allowNo).toBe(true)

    expect((IncidentsResolve.flags['notify-subscribers'] as any).default).toBe(true)
    expect((IncidentsResolve.flags['notify-subscribers'] as any).allowNo).toBe(true)
  })

  it('passes notifySubscribers=true when creating incidents', async () => {
    const context = createCommandContext({
      flags: {
        'status-page-id': 'sp-1',
        'title': 'Checkout API outage',
        'severity': 'major',
        'notify-subscribers': true,
        'output': 'json',
      },
    })

    await IncidentsCreate.prototype.run.call(context as any)

    expect(api.incidents.create).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(api.incidents.create).mock.calls[0][0]
    expect(payload.incidentUpdates[0].notifySubscribers).toBe(true)
  })

  it('passes notifySubscribers=false when creating incidents with --no-notify-subscribers', async () => {
    const context = createCommandContext({
      flags: {
        'status-page-id': 'sp-1',
        'title': 'Checkout API outage',
        'severity': 'major',
        'notify-subscribers': false,
        'output': 'json',
      },
    })

    await IncidentsCreate.prototype.run.call(context as any)

    expect(api.incidents.create).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(api.incidents.create).mock.calls[0][0]
    expect(payload.incidentUpdates[0].notifySubscribers).toBe(false)
  })

  it('passes notifySubscribers=true for incident updates', async () => {
    const context = createCommandContext({
      args: { id: 'inc-1' },
      flags: {
        'message': 'Mitigation deployed',
        'status': 'monitoring',
        'notify-subscribers': true,
        'output': 'json',
      },
    })

    await IncidentsUpdate.prototype.run.call(context as any)

    expect(api.incidents.createUpdate).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(api.incidents.createUpdate).mock.calls[0][1]
    expect(payload.notifySubscribers).toBe(true)
  })

  it('passes notifySubscribers=false for incident updates with --no-notify-subscribers', async () => {
    const context = createCommandContext({
      args: { id: 'inc-1' },
      flags: {
        'message': 'Mitigation deployed',
        'status': 'monitoring',
        'notify-subscribers': false,
        'output': 'json',
      },
    })

    await IncidentsUpdate.prototype.run.call(context as any)

    expect(api.incidents.createUpdate).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(api.incidents.createUpdate).mock.calls[0][1]
    expect(payload.notifySubscribers).toBe(false)
  })

  it('passes notifySubscribers=true when resolving incidents', async () => {
    const context = createCommandContext({
      args: { id: 'inc-1' },
      flags: {
        'notify-subscribers': true,
        'output': 'json',
      },
    })

    await IncidentsResolve.prototype.run.call(context as any)

    expect(api.incidents.createUpdate).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(api.incidents.createUpdate).mock.calls[0][1]
    expect(payload.notifySubscribers).toBe(true)
  })

  it('passes notifySubscribers=false when resolving incidents with --no-notify-subscribers', async () => {
    const context = createCommandContext({
      args: { id: 'inc-1' },
      flags: {
        'notify-subscribers': false,
        'output': 'json',
      },
    })

    await IncidentsResolve.prototype.run.call(context as any)

    expect(api.incidents.createUpdate).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(api.incidents.createUpdate).mock.calls[0][1]
    expect(payload.notifySubscribers).toBe(false)
  })

  it('updates incident severity when --severity flag is provided', async () => {
    const context = createCommandContext({
      args: { id: 'inc-1' },
      flags: {
        'message': 'Escalating to critical',
        'status': 'identified',
        'severity': 'critical',
        'notify-subscribers': true,
        'output': 'json',
      },
    })

    await IncidentsUpdate.prototype.run.call(context as any)

    expect(api.incidents.update).toHaveBeenCalledTimes(1)
    expect(api.incidents.update).toHaveBeenCalledWith('inc-1', { severity: 'CRITICAL' })
    expect(api.incidents.createUpdate).toHaveBeenCalledTimes(1)
  })

  it('does not call update when --severity flag is omitted', async () => {
    const context = createCommandContext({
      args: { id: 'inc-1' },
      flags: {
        'message': 'Still investigating',
        'status': 'investigating',
        'notify-subscribers': true,
        'output': 'json',
      },
    })

    await IncidentsUpdate.prototype.run.call(context as any)

    expect(api.incidents.update).not.toHaveBeenCalled()
    expect(api.incidents.createUpdate).toHaveBeenCalledTimes(1)
  })
})
