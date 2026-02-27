import config from 'config'
import axios, { type AxiosInstance } from 'axios'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { runChecklyCli } from '../run-checkly'

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
  it('should list incidents with default output', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--status', 'all'],
      apiKey,
      accountId,
    })
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should output valid JSON with --output json', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--status', 'all', '--output', 'json'],
      apiKey,
      accountId,
    })
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toHaveProperty('data')
    expect(Array.isArray(parsed.data)).toBe(true)
    expect(parsed).toHaveProperty('count')
  })

  it('should output markdown with --output md', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--status', 'all', '--output', 'md'],
      apiKey,
      accountId,
    })
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should filter by open status by default', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--output', 'json'],
      apiKey,
      accountId,
    })
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toHaveProperty('data')
    for (const incident of parsed.data) {
      expect(incident.lastUpdateStatus).not.toBe('RESOLVED')
    }
  })

  it('should filter by resolved status', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--status', 'resolved', '--output', 'json'],
      apiKey,
      accountId,
    })
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toHaveProperty('data')
    for (const incident of parsed.data) {
      expect(incident.lastUpdateStatus).toBe('RESOLVED')
    }
  })
})

describe('incidents lifecycle (create → update → resolve → delete)', () => {
  const api = createApiClient()
  let statusPageId: string
  let serviceId: string
  let incidentId: string

  beforeAll(async () => {
    const serviceRes = await api.post('/v1/status-pages/services', { name: 'E2E Test Service' })
    serviceId = serviceRes.data.id

    const statusPageRes = await api.post('/v1/status-pages', {
      name: 'E2E Test Status Page',
      url: `e2e-test-${Date.now()}`,
      cards: [{ name: 'Default', services: [{ id: serviceId }] }],
    })
    statusPageId = statusPageRes.data.id
  }, 30_000)

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
  })

  it('should create an incident', async () => {
    const result = await runChecklyCli({
      args: [
        'incidents', 'create',
        '--status-page-id', statusPageId,
        '--title', 'E2E Test Incident',
        '--severity', 'minor',
        '--message', 'Automated e2e test incident.',
        '--no-notify-subscribers',
        '--output', 'json',
      ],
      apiKey,
      accountId,
    })
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
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
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
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
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
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
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
    const update = JSON.parse(result.stdout)
    expect(update).toHaveProperty('status', 'RESOLVED')
  })

  it('should show the incident as resolved in list', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--status', 'resolved', '--output', 'json'],
      apiKey,
      accountId,
    })
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
    const parsed = JSON.parse(result.stdout)
    const found = parsed.data.find((i: any) => i.id === incidentId)
    expect(found).toBeDefined()
    expect(found.lastUpdateStatus).toBe('RESOLVED')
  })
})
