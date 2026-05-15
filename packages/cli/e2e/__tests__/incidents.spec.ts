import config from 'config'
import axios, { type AxiosInstance } from 'axios'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

const apiKey: string = config.get('apiKey')
const accountId: string = config.get('accountId')
const baseURL: string = config.get('baseURL')

function createApiClient (): AxiosInstance {
  return axios.create({
    baseURL,
    headers: {
      'x-checkly-account': accountId,
      'Authorization': `Bearer ${apiKey}`,
    },
  })
}

describe('checkly incidents list', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({ template: 'bare' })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should list incidents as JSON with correct structure', async () => {
    const { stdout } = await runCheckly(fixt, ['incidents', 'list', '--status', 'all', '--output', 'json'], {
      apiKey,
      accountId,
    })
    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveProperty('data')
    expect(Array.isArray(parsed.data)).toBe(true)
    expect(parsed).toHaveProperty('count')
  })

  it('should respect --limit flag', async () => {
    const { stdout } = await runCheckly(fixt, ['incidents', 'list', '--status', 'all', '--limit', '2', '--output', 'json'], {
      apiKey,
      accountId,
    })
    const parsed = JSON.parse(stdout)
    expect(parsed.data.length).toBeLessThanOrEqual(2)
  })

  it('should filter by status', async () => {
    const { stdout } = await runCheckly(fixt, ['incidents', 'list', '--status', 'resolved', '--output', 'json'], {
      apiKey,
      accountId,
    })
    const parsed = JSON.parse(stdout)
    for (const incident of parsed.data) {
      expect(incident.lastUpdateStatus).toBe('RESOLVED')
    }
  })
})

describe('incidents lifecycle (create → update → resolve → delete)', () => {
  let fixt: FixtureSandbox
  const api = createApiClient()
  let statusPageId: string
  let serviceId: string
  let incidentId: string

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({ template: 'bare' })

    const serviceRes = await api.post('/v1/status-pages/services', { name: 'E2E Test Service' })
    serviceId = serviceRes.data.id

    const statusPageRes = await api.post('/v1/status-pages', {
      name: 'E2E Test Status Page',
      url: `e2e-test-${Date.now()}`,
      cards: [{ name: 'Default', services: [{ id: serviceId }] }],
    })
    statusPageId = statusPageRes.data.id
  }, 180_000)

  afterAll(async () => {
    const cleanups: Promise<void>[] = []
    if (incidentId) {
      cleanups.push(
        api.delete(`/v1/status-pages/incidents/${incidentId}`).catch(() => {}),
      )
    }
    if (statusPageId) {
      cleanups.push(
        api.delete(`/v1/status-pages/${statusPageId}`).catch(() => {}),
      )
    }
    if (serviceId) {
      cleanups.push(
        api.delete(`/v1/status-pages/services/${serviceId}`).catch(() => {}),
      )
    }
    await Promise.all(cleanups)
    await fixt?.destroy()
  })

  it('should create an incident', async () => {
    const { stdout } = await runCheckly(fixt, [
      'incidents', 'create',
      '--status-page-id', statusPageId,
      '--title', 'e2e-test-incident',
      '--severity', 'minor',
      '--message', 'e2e-test-created',
      '--no-notify-subscribers',
      '--output', 'json',
      '--force',
    ], {
      apiKey,
      accountId,
    })
    const incident = JSON.parse(stdout)
    expect(incident).toHaveProperty('id')
    expect(incident.name).toBe('e2e-test-incident')
    expect(incident.severity).toBe('MINOR')
    incidentId = incident.id
  })

  it('should post a progress update', async () => {
    const { stdout } = await runCheckly(fixt, [
      'incidents', 'update', incidentId,
      '--message', 'e2e-root-cause-identified',
      '--status', 'identified',
      '--no-notify-subscribers',
      '--output', 'json',
      '--force',
    ], {
      apiKey,
      accountId,
    })
    const update = JSON.parse(stdout)
    expect(update).toHaveProperty('status', 'IDENTIFIED')
    expect(update).toHaveProperty('description', 'e2e-root-cause-identified')
  })

  it('should resolve the incident', async () => {
    const { stdout } = await runCheckly(fixt, [
      'incidents', 'resolve', incidentId,
      '--message', 'e2e-test-resolved',
      '--no-notify-subscribers',
      '--output', 'json',
      '--force',
    ], {
      apiKey,
      accountId,
    })
    const update = JSON.parse(stdout)
    expect(update).toHaveProperty('status', 'RESOLVED')
  })

  it('should show the incident as resolved in list', async () => {
    const { stdout } = await runCheckly(fixt, ['incidents', 'list', '--status', 'resolved', '--output', 'json'], {
      apiKey,
      accountId,
    })
    const parsed = JSON.parse(stdout)
    const found = parsed.data.find((i: any) => i.id === incidentId)
    expect(found).toBeDefined()
    expect(found.lastUpdateStatus).toBe('RESOLVED')
  })
})
