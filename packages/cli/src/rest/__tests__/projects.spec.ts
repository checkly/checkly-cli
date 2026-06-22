import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import type { AxiosInstance } from 'axios'
import Projects, { ProjectDeployFailedError, type ProjectSync } from '../projects.js'
import { NotFoundError } from '../errors.js'

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
      '/v1/projects/deployments/dep-1/events',
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

    await expect(projects.streamDeploymentEvents('dep-1', { maxReconnects: 2 })).rejects.toThrow()
    expect(api.get).toHaveBeenCalledTimes(3) // initial + 2 reconnects
  })

  it('propagates a non-stream error from the initial connect', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'dep-1', status: 'PENDING' } })
    vi.mocked(api.get).mockRejectedValue(new Error('network down'))

    await expect(projects.deploy(sync, { dryRun: false })).rejects.toThrow('network down')
  })
})
