import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { AxiosInstance } from 'axios'
import Projects, { type ProjectSync } from '../projects.js'

// Build an SSE frame and a readable stream that emits the given frames then ends.
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const sseStream = (...frames: string[]) => ({ data: Readable.from(frames) })

const applied = { project: { name: 'p', logicalId: 'p' }, diff: [] }

function createProjects (deployment: Record<string, unknown> = {}) {
  // A real (non-dry-run) deploy submits, then follows the SSE stream to completion,
  // so post returns a deployment id and get yields a terminal 'complete' frame.
  const post = vi.fn().mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
  // A fresh stream per call: a stream is spent once a deploy has read it.
  const get = vi.fn().mockImplementation(() => Promise.resolve(
    sseStream(sse('complete', {
      id: 'dep-1',
      status: 'SUCCEEDED',
      progress: 100,
      result: applied,
      error: null,
      ...deployment,
    })),
  ))
  const api = { post, get } as unknown as AxiosInstance
  return { projects: new Projects(api), post }
}

const resources: ProjectSync = {
  project: { name: 'p', logicalId: 'p' },
  resources: [],
  repoInfo: null,
}

describe('Projects.deploy query params', () => {
  it('omits preserveResources by default', async () => {
    const { projects, post } = createProjects()
    await projects.deploy(resources)
    const url = post.mock.calls[0][0] as string
    expect(url).toContain('dryRun=false')
    expect(url).toContain('scheduleOnDeploy=false')
    expect(url).not.toContain('preserveResources')
  })

  it('forwards preserveResources=true', async () => {
    const { projects, post } = createProjects()
    await projects.deploy(resources, { dryRun: true, scheduleOnDeploy: true, preserveResources: true })
    const url = post.mock.calls[0][0] as string
    expect(url).toContain('dryRun=true')
    expect(url).toContain('scheduleOnDeploy=true')
    expect(url).toContain('preserveResources=true')
  })
})

describe('Projects.deploy scheduling threshold', () => {
  it('sends the threshold only when one is given', async () => {
    const { projects, post } = createProjects()
    await projects.deploy(resources)
    expect(post.mock.calls[0][0]).not.toContain('scheduleOnDeployThreshold')

    await projects.deploy(resources, { scheduleOnDeployThreshold: 0 })
    expect(post.mock.calls[1][0]).toContain('&scheduleOnDeployThreshold=0')
  })

  it('sends the scope, the changed checks unless one is given', async () => {
    const { projects, post } = createProjects()
    await projects.deploy(resources)
    expect(post.mock.calls[0][0]).toContain('&scheduleOnDeployScope=changed')

    await projects.deploy(resources, { scheduleOnDeployScope: 'all' })
    expect(post.mock.calls[1][0]).toContain('&scheduleOnDeployScope=all')
  })

  it('sends the minimum frequency only when one is given', async () => {
    const { projects, post } = createProjects()
    await projects.deploy(resources)
    expect(post.mock.calls[0][0]).not.toContain('scheduleOnDeployMinFrequency')

    await projects.deploy(resources, { scheduleOnDeployMinFrequency: 15 })
    expect(post.mock.calls[1][0]).toContain('&scheduleOnDeployMinFrequency=15')
  })

  it('reports that the checks were not scheduled when the deployment says so', async () => {
    const { projects } = createProjects({ scheduleOnDeploy: false })
    const { data } = await projects.deploy(resources)
    expect(data.scheduled).toBe(false)
  })

  it('reports the requested scheduling when the deployment does not say', async () => {
    const { projects } = createProjects()
    expect((await projects.deploy(resources)).data.scheduled).toBe(false)
    expect((await projects.deploy(resources, { scheduleOnDeploy: true })).data.scheduled).toBe(true)
  })
})
