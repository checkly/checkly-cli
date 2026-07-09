import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import type { AxiosInstance } from 'axios'
import Projects, { ProjectDeployCancelledError, ProjectDeployFailedError, type ProjectSync } from '../projects.js'
import { ConflictError, NotFoundError, RequestTimeoutError } from '../errors.js'

function makeAxiosMock (): AxiosInstance {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  } as unknown as AxiosInstance
}

const sync: ProjectSync = {
  project: { name: 'My Project', logicalId: 'my-project' },
  resources: [],
  repoInfo: null,
}

// Build an SSE frame and a readable stream that emits the given frames then ends.
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const sseStream = (...frames: string[]) => ({ data: Readable.from(frames) })
// A stream that drops with a socket error before any terminal frame.
const erroringStream = () => {
  const stream = new Readable({ read () {} })
  setImmediate(() => stream.destroy(new Error('ECONNRESET')))
  return { data: stream }
}

const applied = { project: sync.project, diff: [{ logicalId: 'check-1', type: 'check', action: 'CREATE' }] }

describe('Projects.deploy', () => {
  let api: AxiosInstance
  let projects: Projects

  beforeEach(() => {
    api = makeAxiosMock()
    projects = new Projects(api)
  })

  it('returns the preview diff synchronously for a dry run (no stream)', async () => {
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

  it('omits preserveResources by default and only sends it when opted in', async () => {
    const preview = { project: sync.project, diff: [] }
    vi.mocked(api.post).mockResolvedValue({ data: preview })

    await projects.deploy(sync, { dryRun: true })
    expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/v1/projects/deploy?dryRun=true&scheduleOnDeploy=true')

    await projects.deploy(sync, { dryRun: true, preserveResources: true })
    expect(vi.mocked(api.post).mock.calls[1][0]).toBe(
      '/v1/projects/deploy?dryRun=true&scheduleOnDeploy=true&preserveResources=true',
    )
  })

  it('submits async, follows the SSE stream, reports progress, and returns the applied diff', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get).mockResolvedValue(
      sseStream(
        sse('progress', { status: 'RUNNING', progress: 40 }),
        sse('complete', { id: 'dep-1', status: 'SUCCEEDED', progress: 100, result: applied, error: null }),
      ),
    )

    const onProgress = vi.fn()
    const { data } = await projects.deploy(sync, { dryRun: false, onProgress })

    expect(api.get).toHaveBeenCalledWith(
      '/v1/projects/my-project/deployments/dep-1/events',
      expect.objectContaining({ responseType: 'stream', headers: { Accept: 'text/event-stream' } }),
    )
    expect(onProgress).toHaveBeenCalledWith(40)
    expect(data).toEqual(applied)
  })

  it('throws ProjectDeployFailedError when the terminal event is not SUCCEEDED', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    // A fresh stream per call (the assertions below deploy twice).
    vi.mocked(api.get).mockImplementation(() =>
      Promise.resolve(
        sseStream(
          sse('complete', {
            id: 'dep-1',
            status: 'FAILED',
            result: null,
            error: { code: 'PLAN_LIMITS_EXCEEDED', message: 'Too many checks.' },
          }),
        ),
      ),
    )

    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow(ProjectDeployFailedError)
    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow('Too many checks.')
  })

  it('throws ProjectDeployCancelledError when the deployment is cancelled', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get).mockResolvedValue(
      sseStream(sse('complete', { id: 'dep-1', status: 'CANCELLED', result: null, error: null })),
    )

    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow(ProjectDeployCancelledError)
  })

  it('throws when the stream emits an error event', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get).mockResolvedValue(sseStream(sse('error', { message: 'stream blew up' })))

    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow('stream blew up')
  })

  it('reconnects when the stream ends before a terminal event', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get)
      .mockResolvedValueOnce(sseStream(sse('progress', { progress: 10 }))) // ends, no terminal
      .mockResolvedValueOnce(sseStream(sse('complete', { status: 'SUCCEEDED', result: applied })))

    const { data } = await projects.deploy(sync, { dryRun: false })

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(data).toEqual(applied)
  })

  it('reconnects after a socket error before a terminal event', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get)
      .mockImplementationOnce(() => Promise.resolve(erroringStream()) as never)
      .mockImplementationOnce(() => Promise.resolve(sseStream(sse('complete', { status: 'SUCCEEDED', result: applied }))) as never)

    const { data } = await projects.deploy(sync, { dryRun: false })

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(data).toEqual(applied)
  })

  it('propagates a typed connect error without reconnecting', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get).mockRejectedValue(
      new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'No such project deployment.' }),
    )

    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow(NotFoundError)
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('gives up after exhausting reconnects', async () => {
    // Fresh stream per (re)connect; never emits a terminal event.
    vi.mocked(api.get).mockImplementation(() => Promise.resolve(sseStream(sse('progress', { progress: 10 }))))

    await expect(projects.streamDeploymentEvents('my-project', 'dep-1', { maxReconnects: 2 })).rejects.toThrow()
    expect(api.get).toHaveBeenCalledTimes(3) // initial + 2 reconnects
  })

  it('propagates a non-stream error from the initial connect', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get).mockRejectedValue(new Error('network down'))

    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow('network down')
  })
})

const conflict = (deploymentId: string) =>
  new ConflictError({
    statusCode: 409,
    error: 'Conflict',
    message: 'A deployment for this project is already in progress.',
    deploymentId,
  })

describe('Projects.deploy cancel-in-progress', () => {
  let api: AxiosInstance
  let projects: Projects

  beforeEach(() => {
    api = makeAxiosMock()
    projects = new Projects(api)
  })

  it('waits for the in-progress deployment then re-POSTs to success (no flag, no cancel)', async () => {
    let deployPosts = 0
    vi.mocked(api.post).mockImplementation((url: string) => {
      // Without the flag we must never cancel the predecessor.
      expect(url).not.toContain('/cancel')
      deployPosts += 1
      return (deployPosts === 1
        ? Promise.reject(conflict('old-dep'))
        : Promise.resolve({ data: { id: 'new-dep', status: 'PENDING' } })) as never
    })
    vi.mocked(api.get).mockImplementation((url: string) =>
      (url.includes('/completion')
        ? Promise.resolve({ data: { id: 'old-dep', status: 'SUCCEEDED' } })
        : Promise.resolve(sseStream(sse('complete', { id: 'new-dep', status: 'SUCCEEDED', result: applied })))) as never,
    )

    const onStatus = vi.fn()
    const { data } = await projects.deploy(sync, { onStatus })

    // Waited on the predecessor's completion, then re-POSTed.
    expect(api.get).toHaveBeenCalledWith(
      '/v1/projects/my-project/deployments/old-dep/completion',
      expect.objectContaining({ params: { maxWaitSeconds: 30 } }),
    )
    const cancelCalls = vi.mocked(api.post).mock.calls.filter(([url]) => String(url).includes('/cancel'))
    expect(cancelCalls).toHaveLength(0)
    expect(deployPosts).toBe(2)
    expect(data).toEqual(applied)
    expect(onStatus).toHaveBeenCalled()
  })

  it('does not re-POST while the predecessor is still running; re-POSTs once it is final', async () => {
    let deployPosts = 0
    let completionPolls = 0
    vi.mocked(api.post).mockImplementation(() => {
      deployPosts += 1
      return (deployPosts === 1
        ? Promise.reject(conflict('old-dep'))
        : Promise.resolve({ data: { id: 'new-dep', status: 'PENDING' } })) as never
    })
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/completion')) {
        completionPolls += 1
        // Still running for the first two long-poll windows, then final.
        return (completionPolls < 3
          ? Promise.reject(
              new RequestTimeoutError({ statusCode: 408, error: 'Request Timeout', message: 'still running' }),
            )
          : Promise.resolve({ data: { id: 'old-dep', status: 'SUCCEEDED' } })) as never
      }
      return Promise.resolve(sseStream(sse('complete', { id: 'new-dep', status: 'SUCCEEDED', result: applied }))) as never
    })

    const { data } = await projects.deploy(sync)

    // Polled three times (two 408s + final) but the payload was POSTed only twice:
    // the initial collision and a single re-POST after the predecessor was final.
    expect(completionPolls).toBe(3)
    expect(deployPosts).toBe(2)
    expect(data).toEqual(applied)
  })

  it('cancels the in-flight deployment, waits, and retries when cancelInProgress is set', async () => {
    let deployPosts = 0
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url.includes('/cancel')) {
        return Promise.resolve({ data: { id: 'old-dep', status: 'RUNNING' } }) as never
      }
      deployPosts += 1
      // First deploy collides with an in-flight deployment; the retry succeeds.
      return (deployPosts === 1
        ? Promise.reject(conflict('old-dep'))
        : Promise.resolve({ data: { id: 'new-dep', status: 'PENDING' } })) as never
    })
    vi.mocked(api.get).mockImplementation((url: string) =>
      (url.includes('/completion')
        ? Promise.resolve({ data: { id: 'old-dep', status: 'CANCELLED' } })
        : Promise.resolve(sseStream(sse('complete', { id: 'new-dep', status: 'SUCCEEDED', result: applied })))) as never,
    )

    const onStatus = vi.fn()
    const { data } = await projects.deploy(sync, { cancelInProgress: true, onStatus })

    expect(api.post).toHaveBeenCalledWith('/v1/projects/my-project/deployments/old-dep/cancel')
    expect(api.get).toHaveBeenCalledWith(
      '/v1/projects/my-project/deployments/old-dep/completion',
      expect.objectContaining({ params: { maxWaitSeconds: 30 } }),
    )
    expect(onStatus).toHaveBeenCalled()
    expect(deployPosts).toBe(2)
    expect(data).toEqual(applied)
  })

  it('proceeds with the retry when the in-flight deployment is already gone (404 on cancel)', async () => {
    let deployPosts = 0
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url.includes('/cancel')) {
        return Promise.reject(
          new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'No such project deployment.' }),
        ) as never
      }
      deployPosts += 1
      return (deployPosts === 1
        ? Promise.reject(conflict('old-dep'))
        : Promise.resolve({ data: { id: 'new-dep', status: 'PENDING' } })) as never
    })
    vi.mocked(api.get).mockResolvedValue(
      sseStream(sse('complete', { id: 'new-dep', status: 'SUCCEEDED', result: applied })) as never,
    )

    const { data } = await projects.deploy(sync, { cancelInProgress: true })

    expect(deployPosts).toBe(2)
    expect(data).toEqual(applied)
  })

  it('awaitDeploymentCompletion does a single long-poll and returns the final deployment', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { id: 'dep-1', status: 'CANCELLED' } } as never)

    const result = await projects.awaitDeploymentCompletion('my-project', 'dep-1')

    expect(result.status).toBe('CANCELLED')
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith(
      '/v1/projects/my-project/deployments/dep-1/completion',
      expect.objectContaining({ params: { maxWaitSeconds: 30 } }),
    )
  })

  it('gives up and surfaces the conflict once the overall wait deadline is exceeded', async () => {
    // Every POST conflicts and the predecessor never finishes (completion 408s).
    let deployPosts = 0
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url.includes('/cancel')) {
        return Promise.resolve({ data: { id: 'x', status: 'RUNNING' } }) as never
      }
      deployPosts += 1
      return Promise.reject(conflict('x')) as never
    })
    vi.mocked(api.get).mockRejectedValue(
      new RequestTimeoutError({ statusCode: 408, error: 'Request Timeout', message: 'still running' }) as never,
    )

    // Advance the (mocked) clock 20 min on every Date.now() call, so the wait
    // deadline (30 min) is crossed after a couple of checks regardless of the
    // exact call count — robust to incidental Date.now() usage.
    const base = Date.now()
    let clock = base
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      const value = clock
      clock += 20 * 60_000
      return value
    })
    try {
      await expect(projects.deploy(sync, { cancelInProgress: true })).rejects.toThrow(ConflictError)
      // One wait round before the deadline trips: initial POST + one retry, with
      // one cancel between.
      expect(deployPosts).toBe(2)
      const cancelCalls = vi.mocked(api.post).mock.calls.filter(([url]) => String(url).includes('/cancel'))
      expect(cancelCalls).toHaveLength(1)
    } finally {
      nowSpy.mockRestore()
    }
  })
})

describe('Projects.deleteProject', () => {
  let api: AxiosInstance
  let projects: Projects

  beforeEach(() => {
    api = makeAxiosMock()
    projects = new Projects(api)
  })

  it('submits the async delete, follows the SSE stream, reports progress, and resolves on SUCCEEDED', async () => {
    const deleteDiff = [{ logicalId: 'check-1', type: 'check', action: 'DELETE' }]
    vi.mocked(api.delete).mockResolvedValue({ data: { id: 'del-1', status: 'PENDING' } } as never)
    vi.mocked(api.get).mockResolvedValue(
      sseStream(
        sse('progress', { status: 'RUNNING', progress: 50 }),
        sse('complete', { id: 'del-1', status: 'SUCCEEDED', progress: 100, result: { diff: deleteDiff }, error: null }),
      ) as never,
    )

    const onProgress = vi.fn()
    await expect(projects.deleteProject('my-project', { onProgress })).resolves.toBeUndefined()

    expect(api.delete).toHaveBeenCalledWith(
      '/v1/projects/my-project',
      expect.objectContaining({ params: { preserveResources: false, dryRun: false } }),
    )
    expect(api.get).toHaveBeenCalledWith(
      '/v1/projects/my-project/deployments/del-1/events',
      expect.objectContaining({ responseType: 'stream', headers: { Accept: 'text/event-stream' } }),
    )
    expect(onProgress).toHaveBeenCalledWith(50)
  })

  it('passes preserveResources through to the endpoint', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { id: 'del-1', status: 'PENDING' } } as never)
    vi.mocked(api.get).mockResolvedValue(
      sseStream(sse('complete', { id: 'del-1', status: 'SUCCEEDED', result: { diff: [] }, error: null })) as never,
    )

    await projects.deleteProject('my-project', { preserveResources: true })

    expect(api.delete).toHaveBeenCalledWith(
      '/v1/projects/my-project',
      expect.objectContaining({ params: { preserveResources: true, dryRun: false } }),
    )
  })

  it('resolves without following a stream when the project does not exist (idempotent)', async () => {
    // A missing project completes synchronously with a plain result body (no status).
    vi.mocked(api.delete).mockResolvedValue({ data: { project: undefined, diff: [] } } as never)

    await expect(projects.deleteProject('never-deployed')).resolves.toBeUndefined()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('throws ProjectDeployFailedError when the deletion ends FAILED', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { id: 'del-1', status: 'PENDING' } } as never)
    vi.mocked(api.get).mockResolvedValue(
      sseStream(
        sse('complete', { id: 'del-1', status: 'FAILED', result: null, error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
      ) as never,
    )

    await expect(projects.deleteProject('my-project')).rejects.toThrow(ProjectDeployFailedError)
  })

  it('throws ProjectDeployCancelledError when the deletion is CANCELLED', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { id: 'del-1', status: 'PENDING' } } as never)
    vi.mocked(api.get).mockResolvedValue(
      sseStream(sse('complete', { id: 'del-1', status: 'CANCELLED', result: null, error: null })) as never,
    )

    await expect(projects.deleteProject('my-project')).rejects.toThrow(ProjectDeployCancelledError)
  })

  it('waits for an in-flight operation (409) to finish, then retries the delete', async () => {
    let deletes = 0
    vi.mocked(api.delete).mockImplementation(() => {
      deletes += 1
      return (deletes === 1
        ? Promise.reject(conflict('old-dep'))
        : Promise.resolve({ data: { id: 'del-2', status: 'PENDING' } })) as never
    })
    vi.mocked(api.get).mockImplementation((url: string) =>
      (url.includes('/completion')
        ? Promise.resolve({ data: { id: 'old-dep', status: 'SUCCEEDED' } })
        : Promise.resolve(sseStream(sse('complete', { id: 'del-2', status: 'SUCCEEDED', result: { diff: [] }, error: null })))) as never,
    )

    const onStatus = vi.fn()
    await expect(projects.deleteProject('my-project', { onStatus })).resolves.toBeUndefined()

    expect(api.get).toHaveBeenCalledWith(
      '/v1/projects/my-project/deployments/old-dep/completion',
      expect.objectContaining({ params: { maxWaitSeconds: 30 } }),
    )
    expect(deletes).toBe(2)
    expect(onStatus).toHaveBeenCalled()
  })

  it('cancels the in-flight operation, waits, and retries when cancelInProgress is set', async () => {
    let deletes = 0
    vi.mocked(api.delete).mockImplementation(() => {
      deletes += 1
      return (deletes === 1
        ? Promise.reject(conflict('old-dep'))
        : Promise.resolve({ data: { id: 'del-2', status: 'PENDING' } })) as never
    })
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'old-dep', status: 'RUNNING' } } as never)
    vi.mocked(api.get).mockImplementation((url: string) =>
      (url.includes('/completion')
        ? Promise.resolve({ data: { id: 'old-dep', status: 'CANCELLED' } })
        : Promise.resolve(sseStream(sse('complete', { id: 'del-2', status: 'SUCCEEDED', result: { diff: [] }, error: null })))) as never,
    )

    await expect(projects.deleteProject('my-project', { cancelInProgress: true })).resolves.toBeUndefined()

    expect(api.post).toHaveBeenCalledWith('/v1/projects/my-project/deployments/old-dep/cancel')
    expect(api.get).toHaveBeenCalledWith(
      '/v1/projects/my-project/deployments/old-dep/completion',
      expect.objectContaining({ params: { maxWaitSeconds: 30 } }),
    )
    expect(deletes).toBe(2)
  })
})
