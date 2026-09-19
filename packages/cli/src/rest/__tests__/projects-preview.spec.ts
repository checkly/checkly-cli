import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import type { AxiosInstance } from 'axios'
import Projects, {
  ProjectPlanStaleError,
  ProjectPlanSupersededError,
  ProjectPreviewNotSupportedError,
  ProjectPreviewUnavailableError,
  type ProjectSync,
} from '../projects.js'
import { ConflictError, NotFoundError, RequestTimeoutError, ValidationError } from '../errors.js'
import { stripUnsupportedDeployFields } from '../../services/deploy-diff/legacy-payload.js'

/**
 * The preview call and the plan token: what the CLI sends, how it survives a
 * busy project, how it behaves against an API that has neither, and what it
 * does when a deploy refuses the plan it was pinned to.
 */

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

const plan = { planToken: 'v1.AAAAAAAAAAAAAAAAAAAAAA', diff: [] }

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const sseStream = (...frames: string[]) => ({ data: Readable.from(frames) })

const conflict = (retryAfter?: string) =>
  new ConflictError({
    statusCode: 409,
    error: 'Conflict',
    message: 'Could not preview this project: another operation is holding it. Please retry.',
    ...retryAfter !== undefined ? { retryAfter } : {},
  })

describe('Projects.preview', () => {
  let api: AxiosInstance
  let projects: Projects

  beforeEach(() => {
    vi.useFakeTimers()
    api = makeAxiosMock()
    projects = new Projects(api)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks for the changes detail level by default and sends no flags it was not given', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: plan })

    expect(await projects.preview(sync)).toEqual(plan)

    expect(api.post).toHaveBeenCalledWith(
      '/v1/projects/preview?detail=changes',
      sync,
      expect.objectContaining({ transformRequest: expect.any(Function) }),
    )
  })

  it('sends the detail level and both flags the caller asked for', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: plan })

    await projects.preview(sync, { detail: 'full', preserveResources: true, pruneRelations: true })

    expect(api.post).toHaveBeenCalledWith(
      '/v1/projects/preview?detail=full&preserveResources=true&pruneRelations=true',
      sync,
      expect.anything(),
    )
  })

  it('reports an API without the endpoint as unsupported rather than as a missing project', async () => {
    vi.mocked(api.post).mockRejectedValue(
      new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'Not Found' }),
    )

    await expect(projects.preview(sync)).rejects.toThrow(ProjectPreviewNotSupportedError)
  })

  it('surfaces a rejected payload as it is', async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ValidationError({ statusCode: 400, error: 'Bad Request', message: 'resource "c" is malformed' }),
    )

    await expect(projects.preview(sync)).rejects.toThrow(ValidationError)
  })

  it('retries a busy project, waiting as long as the API asked', async () => {
    vi.mocked(api.post)
      .mockRejectedValueOnce(conflict('5'))
      .mockResolvedValueOnce({ data: plan })
    const onStatus = vi.fn()

    const pending = projects.preview(sync, { onStatus })
    // Still waiting: the retry is not due yet.
    await vi.advanceTimersByTimeAsync(4_000)
    expect(api.post).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(await pending).toEqual(plan)
    expect(api.post).toHaveBeenCalledTimes(2)
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('holding the project'))
  })

  it('gives up after three attempts and says what is going on', async () => {
    vi.mocked(api.post).mockRejectedValue(conflict('1'))

    const pending = projects.preview(sync)
    const assertion = expect(pending).rejects.toThrow(ProjectPreviewUnavailableError)
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion

    expect(api.post).toHaveBeenCalledTimes(3)
  })

  it('caps how long it honours a retry-after', async () => {
    vi.mocked(api.post)
      .mockRejectedValueOnce(conflict('600'))
      .mockResolvedValueOnce({ data: plan })

    const pending = projects.preview(sync)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(await pending).toEqual(plan)
  })
})

describe('Projects.deploy with a plan token', () => {
  let api: AxiosInstance
  let projects: Projects

  beforeEach(() => {
    api = makeAxiosMock()
    projects = new Projects(api)
  })

  it('sends the token and the pruning flag, and omits both when unset', async () => {
    const applied = { project: sync.project, diff: [] }
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'd1', logicalId: 'my-project', status: 'PENDING' } })
    vi.mocked(api.get).mockResolvedValue(
      sseStream(sse('complete', { id: 'd1', status: 'SUCCEEDED', progress: 100, result: applied, error: null })),
    )

    await projects.deploy(sync, { planToken: 'v1.token+slash/value', pruneRelations: true })

    expect(api.post).toHaveBeenCalledWith(
      '/v1/projects/deploy?dryRun=false&scheduleOnDeploy=true&pruneRelations=true'
      + '&planToken=v1.token%2Bslash%2Fvalue',
      sync,
      expect.anything(),
    )

    vi.mocked(api.post).mockClear()
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'd2', logicalId: 'my-project', status: 'PENDING' } })
    vi.mocked(api.get).mockResolvedValue(
      sseStream(sse('complete', { id: 'd1', status: 'SUCCEEDED', progress: 100, result: applied, error: null })),
    )

    await projects.deploy(sync)

    expect(api.post).toHaveBeenCalledWith(
      '/v1/projects/deploy?dryRun=false&scheduleOnDeploy=true',
      sync,
      expect.anything(),
    )
  })

  it('does not re-send a token after waiting out another deployment', async () => {
    // Whatever the predecessor wrote, finishing is what moved the state the
    // token describes: re-POSTing the payload would buy a certain refusal.
    const conflict = new ConflictError({
      statusCode: 409,
      error: 'Conflict',
      message: 'A deployment is already in progress.',
      deploymentId: 'dep-running',
    })
    vi.mocked(api.post).mockRejectedValue(conflict)
    // The predecessor is gone by the time we look, so the wait ends at once.
    vi.mocked(api.get).mockRejectedValue(
      new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'Not Found' }),
    )

    await expect(projects.deploy(sync, { planToken: plan.planToken }))
      .rejects.toThrow(ProjectPlanSupersededError)

    // One POST, not two: the second would have carried the stale token.
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('surfaces the conflict when the wait gives up with the predecessor still running', async () => {
    // Nothing finished, so nothing invalidated the plan: the caller needs to
    // hear that a deployment is still in progress, not that its plan is stale.
    const conflict = new ConflictError({
      statusCode: 409,
      error: 'Conflict',
      message: 'A deployment is already in progress.',
      deploymentId: 'dep-running',
    })
    vi.mocked(api.post).mockRejectedValue(conflict)
    // The completion endpoint keeps timing out: the predecessor runs on.
    vi.mocked(api.get).mockRejectedValue(
      new RequestTimeoutError({ statusCode: 408, error: 'Request Timeout', message: 'still running' }),
    )
    // Past the deadline on the first look, so the wait gives up at once.
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValueOnce(0).mockReturnValue(31 * 60_000)

    const error = await projects.deploy(sync, { planToken: plan.planToken }).catch(err => err)

    expect(error).toBeInstanceOf(ConflictError)
    expect(error).not.toBeInstanceOf(ProjectPlanSupersededError)
    now.mockRestore()
  })

  it('deploys anyway when it cancelled the predecessor itself', async () => {
    // The caller asked to deploy instead of the running deployment; a
    // cancelled one may have written nothing at all, so the deploy goes ahead
    // and Checkly's own check decides whether the plan still holds.
    const applied = { project: sync.project, diff: [] }
    vi.mocked(api.post)
      .mockRejectedValueOnce(new ConflictError({
        statusCode: 409,
        error: 'Conflict',
        message: 'A deployment is already in progress.',
        deploymentId: 'dep-running',
      }))
      // The cancel call, then the retried deploy.
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { id: 'd2', logicalId: 'my-project', status: 'PENDING' } })
    vi.mocked(api.get)
      .mockRejectedValueOnce(new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'Not Found' }))
      .mockResolvedValueOnce(
        sseStream(sse('complete', { id: 'd2', status: 'SUCCEEDED', progress: 100, result: applied, error: null })),
      )

    await projects.deploy(sync, { planToken: plan.planToken, cancelInProgress: true })

    const deployCalls = vi.mocked(api.post).mock.calls.filter(([url]) => url.includes('/projects/deploy'))
    expect(deployCalls).toHaveLength(2)
    expect(deployCalls[1][0]).toContain(`planToken=${plan.planToken}`)
  })

  it('still retries after a predecessor when no plan is pinned', async () => {
    const applied = { project: sync.project, diff: [] }
    const conflict = new ConflictError({
      statusCode: 409,
      error: 'Conflict',
      message: 'A deployment is already in progress.',
      deploymentId: 'dep-running',
    })
    vi.mocked(api.post)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ data: { id: 'd2', logicalId: 'my-project', status: 'PENDING' } })
    vi.mocked(api.get)
      .mockRejectedValueOnce(new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'Not Found' }))
      .mockResolvedValueOnce(
        sseStream(sse('complete', { id: 'd2', status: 'SUCCEEDED', progress: 100, result: applied, error: null })),
      )

    await projects.deploy(sync)

    expect(api.post).toHaveBeenCalledTimes(2)
  })

  it('reports a refused plan with the plan as it looks now, and never retries it', async () => {
    const fresh = [{ logicalId: 'c1', type: 'check', action: 'UPDATE', changes: [{ path: '/name', origin: 'remote' }] }]
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'd1', logicalId: 'my-project', status: 'PENDING' } })
    vi.mocked(api.get).mockResolvedValue(
      sseStream(sse('complete', {
        id: 'd1',
        status: 'FAILED',
        progress: 100,
        error: { code: 'PLAN_STALE', message: 'The project changed since the preview.' },
        result: { project: null, diff: fresh },
      })),
    )

    const error = await projects.deploy(sync, { planToken: plan.planToken }).catch(err => err)

    expect(error).toBeInstanceOf(ProjectPlanStaleError)
    expect(error.diff).toEqual(fresh)
    // One POST: a refused plan is never resent, since the deploy's own commit
    // would have invalidated the token anyway.
    expect(api.post).toHaveBeenCalledTimes(1)
  })
})

describe('the payload an API without the preview endpoint accepts', () => {
  const payload: ProjectSync = {
    project: { name: 'My Project', logicalId: 'my-project' },
    repoInfo: null,
    resources: [
      {
        logicalId: 'browser',
        type: 'check',
        member: true,
        sourceFile: '__checks__/browser.check.ts',
        payload: {
          name: 'Browser',
          checkType: 'BROWSER',
          snapshots: [
            { path: 'a.png', key: 'checks/a.png', sha256: 'a'.repeat(64) },
            { path: 'b.png', sha256: 'b'.repeat(64) },
          ],
        },
      },
      {
        logicalId: 'suite',
        type: 'check',
        member: true,
        sourceFile: 'suite.check.ts',
        payload: { name: 'Suite', checkType: 'PLAYWRIGHT', codeBundlePath: 'k', codeBundleSha256: 'c'.repeat(64) },
      },
      { logicalId: 'referenced', type: 'alert-channel', member: false, payload: null },
    ],
  }

  it('strips the three fields such an API rejects, and nothing else', () => {
    const stripped = stripUnsupportedDeployFields(payload)

    const [browser, suite, referenced] = stripped.resources
    expect(browser).not.toHaveProperty('sourceFile')
    expect(suite).not.toHaveProperty('sourceFile')
    expect(suite.payload).not.toHaveProperty('codeBundleSha256')
    // The bundle key itself is what the deploy needs, and it stays.
    expect(suite.payload.codeBundlePath).toBe('k')
    // An uploaded snapshot keeps its key and loses its hash; one that was never
    // uploaded describes a file this API cannot be told about at all.
    expect(browser.payload.snapshots).toEqual([{ path: 'a.png', key: 'checks/a.png' }])
    // A referenced resource has no payload to strip anything from.
    expect(referenced).toEqual({ logicalId: 'referenced', type: 'alert-channel', member: false, payload: null })
    // The original is untouched, so the caller can still deploy the full
    // payload to an API that does support the endpoint.
    expect(payload.resources[0].sourceFile).toBe('__checks__/browser.check.ts')
  })

  it('keeps an empty snapshots array, which says the check has none', () => {
    // Dropping the key would turn "this check has no snapshots" into "nothing
    // about snapshots", and an older API treats an absent optional key as
    // "leave what is stored".
    const emptied: ProjectSync = {
      ...payload,
      resources: [{
        logicalId: 'browser',
        type: 'check',
        member: true,
        payload: { name: 'Browser', checkType: 'BROWSER', snapshots: [] },
      }],
    }

    expect(stripUnsupportedDeployFields(emptied).resources[0].payload.snapshots).toEqual([])
  })

  it('drops the snapshots array when nothing in it has been uploaded', () => {
    const notUploaded: ProjectSync = {
      ...payload,
      resources: [{
        logicalId: 'browser',
        type: 'check',
        member: true,
        payload: { name: 'Browser', checkType: 'BROWSER', snapshots: [{ path: 'a.png', sha256: 'a'.repeat(64) }] },
      }],
    }

    expect(stripUnsupportedDeployFields(notUploaded).resources[0].payload).not.toHaveProperty('snapshots')
  })
})
