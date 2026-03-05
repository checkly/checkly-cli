import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StatusPage } from '../../../rest/status-pages'

vi.mock('../../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../../rest/api', () => ({
  statusPages: { get: vi.fn() },
  incidents: { create: vi.fn(), get: vi.fn(), createUpdate: vi.fn() },
}))

vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({ confirm: true })),
}))

import { detectCliMode } from '../../../helpers/cli-mode'
import * as api from '../../../rest/api'
import { AuthCommand } from '../../authCommand'
import IncidentsCreate from '../create'
import IncidentsUpdate from '../update'
import IncidentsResolve from '../resolve'
import IncidentsList from '../list'

const statusPageFixture: StatusPage = {
  id: 'sp-1',
  name: 'Acme Status',
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

const incidentFixture = {
  id: 'inc-1',
  name: 'DB outage',
  severity: 'MAJOR',
  lastUpdateStatus: 'INVESTIGATING',
  services: [{ id: 'svc-1', name: 'Checkout API', accountId: 'acc-1' }],
}

function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  let didExit = false
  let exitCodeValue: number | undefined
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    exit: vi.fn((code: number) => {
      didExit = true
      exitCodeValue = code
      throw new Error(`EXIT_${code}`)
    }),
    confirmOrAbort: AuthCommand.prototype.confirmOrAbort,
    style: { outputFormat: undefined, longError: vi.fn() },
    constructor: IncidentsCreate,
    logged,
    get didExit () {
      return didExit
    },
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

describe('incident commands confirmation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.statusPages.get).mockResolvedValue(statusPageFixture)
    vi.mocked(api.incidents.create).mockResolvedValue(incidentFixture as any)
    vi.mocked(api.incidents.get).mockResolvedValue(incidentFixture as any)
    vi.mocked(api.incidents.createUpdate).mockResolvedValue({ id: 'upd-1' } as any)
  })

  it('incidents list has readOnly=true', () => {
    expect(IncidentsList.readOnly).toBe(true)
    expect(IncidentsList.destructive).toBe(false)
    expect(IncidentsList.idempotent).toBe(true)
  })

  it('incidents create has correct metadata', () => {
    expect(IncidentsCreate.readOnly).toBe(false)
    expect(IncidentsCreate.destructive).toBe(false)
    expect(IncidentsCreate.idempotent).toBe(false)
  })

  it('incidents create exits 2 in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      flags: {
        'status-page-id': 'sp-1',
        'title': 'DB outage',
        'severity': 'major',
        'notify-subscribers': true,
        'output': 'table',
        'force': false,
        'dry-run': false,
      },
    })
    ctx.constructor = IncidentsCreate

    await expect(
      IncidentsCreate.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.command).toBe('incidents create')
    expect(output.changes.length).toBeGreaterThan(0)
    expect(output.confirmCommand).toContain('--force')
    expect(api.incidents.create).not.toHaveBeenCalled()
  })

  it('incidents create executes with --force in agent mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      flags: {
        'status-page-id': 'sp-1',
        'title': 'DB outage',
        'severity': 'major',
        'notify-subscribers': true,
        'output': 'json',
        'force': true,
        'dry-run': false,
      },
    })
    ctx.constructor = IncidentsCreate

    await IncidentsCreate.prototype.run.call(ctx as any)

    expect(api.incidents.create).toHaveBeenCalledTimes(1)
  })

  it('incidents create dry-run exits 0 with preview', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    const ctx = createCommandContext({
      flags: {
        'status-page-id': 'sp-1',
        'title': 'DB outage',
        'severity': 'major',
        'notify-subscribers': true,
        'output': 'table',
        'force': false,
        'dry-run': true,
      },
    })
    ctx.constructor = IncidentsCreate

    await expect(
      IncidentsCreate.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_0')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('dry_run')
    expect(api.incidents.create).not.toHaveBeenCalled()
  })

  it('incidents update exits 2 in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      args: { id: 'inc-1' },
      flags: {
        'message': 'Fix deployed',
        'status': 'monitoring',
        'notify-subscribers': true,
        'output': 'table',
        'force': false,
        'dry-run': false,
      },
    })
    ctx.constructor = IncidentsUpdate

    await expect(
      IncidentsUpdate.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.command).toBe('incidents update')
    expect(api.incidents.createUpdate).not.toHaveBeenCalled()
  })

  it('incidents resolve exits 2 in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      args: { id: 'inc-1' },
      flags: {
        'notify-subscribers': true,
        'output': 'table',
        'force': false,
        'dry-run': false,
      },
    })
    ctx.constructor = IncidentsResolve

    await expect(
      IncidentsResolve.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.command).toBe('incidents resolve')
    expect(api.incidents.createUpdate).not.toHaveBeenCalled()
  })
})
