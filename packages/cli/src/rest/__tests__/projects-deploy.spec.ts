import { describe, it, expect, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import Projects, { type ProjectSync } from '../projects.js'

function createProjects () {
  const post = vi.fn().mockResolvedValue({ data: { project: {}, diff: [] } })
  const api = { post } as unknown as AxiosInstance
  return { projects: new Projects(api), post }
}

const resources: ProjectSync = {
  project: { name: 'p', logicalId: 'p' },
  resources: [],
  repoInfo: null,
}

describe('Projects.deploy query params', () => {
  it('defaults preserveResources to false', () => {
    const { projects, post } = createProjects()
    projects.deploy(resources)
    const url = post.mock.calls[0][0] as string
    expect(url).toContain('dryRun=false')
    expect(url).toContain('scheduleOnDeploy=true')
    expect(url).toContain('preserveResources=false')
  })

  it('forwards preserveResources=true', () => {
    const { projects, post } = createProjects()
    projects.deploy(resources, { dryRun: true, scheduleOnDeploy: false, preserveResources: true })
    const url = post.mock.calls[0][0] as string
    expect(url).toContain('dryRun=true')
    expect(url).toContain('scheduleOnDeploy=false')
    expect(url).toContain('preserveResources=true')
  })
})
