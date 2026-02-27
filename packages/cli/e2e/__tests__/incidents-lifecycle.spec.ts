import config from 'config'
import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

const apiKey: string | undefined = config.get('emptyApiKey')
const accountId: string | undefined = config.get('emptyAccountId')
const statusPageId: string | undefined = config.get('emptyStatusPageId')

describe.skipIf(!apiKey || !accountId || !statusPageId)('incidents lifecycle (create → update → resolve)', () => {
  let incidentId: string

  it('should create an incident', async () => {
    const result = await runChecklyCli({
      args: [
        'incidents', 'create',
        '--status-page-id', statusPageId!,
        '--title', 'E2E Test Incident',
        '--severity', 'minor',
        '--message', 'Automated e2e test incident.',
        '--no-notify-subscribers',
        '--output', 'json',
      ],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(0)
    const incident = JSON.parse(result.stdout)
    expect(incident).toHaveProperty('id')
    expect(incident.name).toBe('E2E Test Incident')
    expect(incident.severity).toBe('MINOR')
    incidentId = incident.id
  })

  it('should list the created incident as open', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--output', 'json'],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    const found = parsed.data.find((i: any) => i.id === incidentId)
    expect(found).toBeDefined()
    expect(found.lastUpdateStatus).not.toBe('RESOLVED')
  })

  it('should post a progress update', async () => {
    const result = await runChecklyCli({
      args: [
        'incidents', 'update', incidentId,
        '--message', 'Root cause identified.',
        '--status', 'identified',
        '--no-notify-subscribers',
        '--output', 'json',
      ],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(0)
    const update = JSON.parse(result.stdout)
    expect(update).toHaveProperty('status', 'IDENTIFIED')
    expect(update).toHaveProperty('description', 'Root cause identified.')
  })

  it('should resolve the incident', async () => {
    const result = await runChecklyCli({
      args: [
        'incidents', 'resolve', incidentId,
        '--message', 'E2E test resolved.',
        '--no-notify-subscribers',
        '--output', 'json',
      ],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(0)
    const update = JSON.parse(result.stdout)
    expect(update).toHaveProperty('status', 'RESOLVED')
  })

  it('should show the incident as resolved in list', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--status', 'resolved', '--output', 'json'],
      apiKey,
      accountId,
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    const found = parsed.data.find((i: any) => i.id === incidentId)
    expect(found).toBeDefined()
    expect(found.lastUpdateStatus).toBe('RESOLVED')
  })
})
