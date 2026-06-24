import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import type { AxiosInstance } from 'axios'
import Projects, { ProjectDeployFailedError, type ProjectSync } from '../projects.js'
import { ConflictError, NotFoundError, RequestTimeoutError } from '../errors.js'

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

  it('propagates the 409 without cancelling when cancelInProgress is not set', async () => {
    vi.mocked(api.post).mockRejectedValue(conflict('old-dep'))

    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow(ConflictError)
    // Only the deploy POST — no cancel POST was attempted.
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.get).not.toHaveBeenCalled()
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

  it('awaitDeploymentCompletion keeps polling on 408 until a final state', async () => {
    vi.mocked(api.get)
      .mockRejectedValueOnce(
        new RequestTimeoutError({ statusCode: 408, error: 'Request Timeout', message: 'still running' }),
      )
      .mockResolvedValueOnce({ data: { id: 'dep-1', status: 'CANCELLED' } })

    const result = await projects.awaitDeploymentCompletion('my-project', 'dep-1', { minPollIntervalMs: 0 })

    expect(result.status).toBe('CANCELLED')
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('gives up with the conflict after exhausting cancel attempts on repeated conflicts', async () => {
    // The deploy POST always conflicts; cancel + completion always succeed, so the
    // cancel→wait→retry loop runs to its cap and then surfaces the conflict.
    vi.mocked(api.post).mockImplementation((url: string) =>
      (url.includes('/cancel')
        ? Promise.resolve({ data: { id: 'x', status: 'RUNNING' } })
        : Promise.reject(conflict('x'))) as never,
    )
    vi.mocked(api.get).mockResolvedValue({ data: { id: 'x', status: 'CANCELLED' } } as never)

    await expect(projects.deploy(sync, { cancelInProgress: true })).rejects.toThrow(ConflictError)
    // Initial attempt + 5 retries = 6 deploy POSTs; 5 cancels in between.
    const cancelCalls = vi.mocked(api.post).mock.calls.filter(([url]) => String(url).includes('/cancel'))
    expect(cancelCalls).toHaveLength(5)
  })
})
