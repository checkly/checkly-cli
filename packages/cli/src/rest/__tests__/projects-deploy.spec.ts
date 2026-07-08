import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { AxiosInstance } from 'axios'
import Projects, { type ProjectSync } from '../projects.js'

// Build an SSE frame and a readable stream that emits the given frames then ends.
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const sseStream = (...frames: string[]) => ({ data: Readable.from(frames) })

const applied = { project: { name: 'p', logicalId: 'p' }, diff: [] }

function createProjects () {
  // A real (non-dry-run) deploy submits, then follows the SSE stream to completion,
  // so post returns a deployment id and get yields a terminal 'complete' frame.
  const post = vi.fn().mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
  const get = vi.fn().mockResolvedValue(
    sseStream(sse('complete', { id: 'dep-1', status: 'SUCCEEDED', progress: 100, result: applied, error: null })),
  )
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
    expect(url).toContain('scheduleOnDeploy=true')
    expect(url).not.toContain('preserveResources')
  })

  it('forwards preserveResources=true', async () => {
    const { projects, post } = createProjects()
    await projects.deploy(resources, { dryRun: true, scheduleOnDeploy: false, preserveResources: true })
    const url = post.mock.calls[0][0] as string
    expect(url).toContain('dryRun=true')
    expect(url).toContain('scheduleOnDeploy=false')
    expect(url).toContain('preserveResources=true')
  })
})
