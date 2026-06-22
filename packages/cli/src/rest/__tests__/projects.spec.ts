import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import Projects, { ProjectDeployFailedError, type ProjectSync } from '../projects.js'
import { RequestTimeoutError } from '../errors.js'

function makeAxiosMock (): AxiosInstance {
  return {
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as AxiosInstance
}

const sync: ProjectSync = {
  project: { name: 'My Project', logicalId: 'my-project' },
  resources: [],
  repoInfo: null,
}

const timeout = () =>
  new RequestTimeoutError({ statusCode: 408, error: 'Request Time-out', message: 'still in progress' })

describe('Projects.deploy', () => {
  let api: AxiosInstance
  let projects: Projects

  beforeEach(() => {
    api = makeAxiosMock()
    projects = new Projects(api)
  })

  it('returns the preview diff synchronously for a dry run (no polling)', async () => {
    const preview = { project: sync.project, diff: [{ logicalId: 'c1', type: 'check', action: 'CREATE' }] }
    vi.mocked(api.post).mockResolvedValue({ data: preview })

    const { data } = await projects.deploy(sync, { dryRun: true })

    expect(api.post).toHaveBeenCalledWith(
      '/v1/projects/deploy?dryRun=true&scheduleOnDeploy=true',
      sync,
      expect.objectContaining({ transformRequest: expect.any(Function) }),
    )
    expect(api.get).not.toHaveBeenCalled()
    expect(data).toEqual(preview)
  })

  it('submits async, polls completion, and returns the applied diff', async () => {
    const applied = { project: sync.project, diff: [{ logicalId: 'c1', type: 'check', action: 'CREATE' }] }
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get).mockResolvedValue({ data: { id: 'dep-1', status: 'SUCCEEDED', result: applied } })

    const { data } = await projects.deploy(sync, { dryRun: false })

    expect(api.post).toHaveBeenCalledWith(
      '/v1/projects/deploy?dryRun=false&scheduleOnDeploy=true',
      sync,
      expect.objectContaining({ transformRequest: expect.any(Function) }),
    )
    expect(api.get).toHaveBeenCalledWith('/v1/projects/deployments/dep-1/completion?maxWaitSeconds=30')
    expect(data).toEqual(applied)
  })

  it('keeps polling on a 408 timeout and reports progress in between', async () => {
    const applied = { project: sync.project, diff: [] }
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })

    let completionCalls = 0
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/completion')) {
        completionCalls += 1
        if (completionCalls === 1) {
          return Promise.reject(timeout())
        }
        return Promise.resolve({ data: { id: 'dep-1', status: 'SUCCEEDED', result: applied } }) as never
      }
      // Snapshot fetch for progress.
      return Promise.resolve({ data: { id: 'dep-1', status: 'RUNNING', progress: 42 } }) as never
    })

    const onProgress = vi.fn()
    const { data } = await projects.deploy(sync, { dryRun: false, onProgress })

    expect(completionCalls).toBe(2)
    expect(onProgress).toHaveBeenCalledWith(42)
    expect(api.get).toHaveBeenCalledWith('/v1/projects/deployments/dep-1')
    expect(data).toEqual(applied)
  })

  it('does not report progress when the snapshot has no numeric progress', async () => {
    const applied = { project: sync.project, diff: [] }
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })

    let completionCalls = 0
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/completion')) {
        completionCalls += 1
        if (completionCalls === 1) {
          return Promise.reject(timeout())
        }
        return Promise.resolve({ data: { id: 'dep-1', status: 'SUCCEEDED', result: applied } }) as never
      }
      // Snapshot without a progress value (e.g. not yet started).
      return Promise.resolve({ data: { id: 'dep-1', status: 'PENDING' } }) as never
    })

    const onProgress = vi.fn()
    await projects.deploy(sync, { dryRun: false, onProgress })

    expect(onProgress).not.toHaveBeenCalled()
  })

  it('throws ProjectDeployFailedError with the deployment error message on failure', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get).mockResolvedValue({
      data: { id: 'dep-1', status: 'FAILED', result: null, error: { code: 'PLAN_LIMITS_EXCEEDED', message: 'Too many checks.' } },
    })

    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow(ProjectDeployFailedError)
    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow('Too many checks.')
  })

  it('re-throws non-timeout errors from the completion poll', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get).mockRejectedValue(new Error('network down'))

    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow('network down')
  })
})
