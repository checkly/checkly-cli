import { type AxiosInstance, isAxiosError } from 'axios'
import { Readable } from 'node:stream'
import type { GitInformation } from '../services/util.js'
import { compressJSONPayload } from './util.js'
import { SharedFile } from '../constructs/index.js'
import { ConflictError, ForbiddenError, handleErrorResponse, NotFoundError, RequestTimeoutError } from './errors.js'
import { parseRetryAfter } from './retry.js'

export interface Project {
  name: string
  logicalId: string
  repoUrl?: string
}

type ProjectResponse = Project & { id: string, created_at: string }

export interface Change {
  logicalId: string
  physicalId?: string | number
  type: string
  action: string
}

/** The API's stand-in for a sensitive value in a reported change. */
export interface DiffMaskedMarker {
  $masked: 'same' | 'changed'
}

/**
 * One property of one resource that a deploy would change, or has changed.
 *
 * `origin` says which side moved since the last deploy: `code` for a local
 * edit, `remote` for one made outside the CLI (the web app, the API), `both`
 * when the property moved on both sides — in which case `remote` carries the
 * movement the deploy is about to overwrite. A value too large to inline is
 * reported as a `{ $hash }` object rather than in the clear; under
 * `detail: 'full'` the deployed text is in the entry's `before`, at the path
 * the import format gives it (the same one for a script or a request body).
 * A secret change (`secret: true`) carries its values with every sensitive
 * position replaced by a `DiffMaskedMarker`, `changed` on the element whose
 * secret moved on that side; never a value or a hash. A list holding an
 * unmoved secret carries `same` markers without the flag.
 * `cause` names the reason for a change with no user-facing property behind
 * it, such as a new code bundle.
 */
export interface DiffChange {
  path: string
  /**
   * `unmanaged` marks an alert channel or private location attached to this
   * project's check or group from outside the project: reported on the resource
   * it belongs to, and only deleted with `--prune-relations`.
   */
  origin: 'code' | 'remote' | 'both' | 'unmanaged'
  before?: unknown
  after?: unknown
  remote?: { before?: unknown, after?: unknown }
  cause?: string
  /** Set when a sensitive value moved or a sensitive list element could not be matched; see `DiffMaskedMarker`. */
  secret?: true
}

/**
 * One rule of the redaction table the API applies to an entry's `before`, as
 * a JSON Pointer pattern (`*` for every list position) and the flag test on
 * the holding element that decides it. The API reports the resource type's
 * whole table, whatever the deployed row held, so the local side blanks by
 * the same rules — a credential the code adds included.
 */
export interface DiffRedaction {
  path: string
  /** What the rule blanks to: a `value` becomes the empty string, an `object` becomes null. */
  kind: 'value' | 'object'
  when?: 'locked' | 'lockedOrSecret'
}

/**
 * A resource in a deploy plan or an applied deploy. `action` is CREATE,
 * UPDATE, DELETE, DETACH (removed from code but kept in the account) or
 * UNCHANGED.
 */
export interface DiffEntry extends Change {
  origin?: 'code' | 'remote' | 'unmanaged'
  /** Absent under `detail: 'summary'`. */
  changes?: DiffChange[]
  /**
   * The resource as currently deployed, in the import format: the payload the
   * import plan returns for it, references as physical ids, a check's or
   * group's subscription and assignment rows on it, credential values blanked.
   * Only under `detail: 'full'`, and only for a retained resource with a
   * change to show.
   */
  before?: Record<string, unknown>
  /** With `before`: the type's redaction rule table, applied to it. */
  redactions?: DiffRedaction[]
  /**
   * Set on a relation (an alert channel subscription, a private location
   * assignment) whose change is reported as part of the check or group it
   * belongs to, so a renderer can fold it into that resource instead of
   * listing it separately.
   */
  foldedInto?: { type: string, logicalId: string }
  /** The file Checkly has recorded for the resource, or null if none. */
  sourceFile?: string | null
}

/** How much of each change a preview reports. */
export type ProjectPreviewDetail = 'summary' | 'changes' | 'full'

export interface ProjectPreviewResponse {
  /** The project as currently deployed; absent before its first deploy. */
  project?: DeployedProject | null
  /**
   * Opaque fingerprint of the Checkly-side state this plan was computed
   * against. Passing it to a deploy makes that deploy refuse, rather than
   * apply a different plan than the one that was reviewed, if anything moved
   * in between.
   */
  planToken: string
  diff: DiffEntry[]
}

export interface ResourceSync {
  logicalId: string
  physicalId?: string | number
  type: string
  member: boolean
  payload: any
}

/**
 * A resource as sent by `checkly deploy`. The import plan API returns plain
 * ResourceSync entries and never carries `sourceFile`.
 */
export interface DeployResourceSync extends ResourceSync {
  /**
   * The file that declares the construct, relative to the git repository
   * root with posix separators. Absent outside a git repository or when the
   * file lives outside the repository. A hint: constructs instantiated in a
   * module imported by a check file or checkly.config.ts report the
   * importing file, so the backend should verify before editing.
   */
  sourceFile?: string
}

export interface AlertChannelFriendResource {
  type: 'alert-channel'
  logicalId: string
  physicalId: number
}

export interface CheckGroupFriendResource {
  type: 'check-group'
  logicalId: string
  physicalId: number
}

export interface PrivateLocationFriendResource {
  type: 'private-location'
  logicalId: string
  physicalId: string
}

export interface StatusPageServiceFriendResource {
  type: 'status-page-service'
  logicalId: string
  physicalId: string
}

export interface StatusPageFriendResource {
  type: 'status-page'
  logicalId: string
  physicalId: string
}

export interface StatusPageComponentFriendResource {
  type: 'status-page-component'
  logicalId: string
  physicalId: string
}

export type FriendResourceSync =
  AlertChannelFriendResource
  | CheckGroupFriendResource
  | PrivateLocationFriendResource
  | StatusPageServiceFriendResource
  | StatusPageFriendResource
  | StatusPageComponentFriendResource

export interface AuxiliaryResourceSync {
  physicalId?: string | number
  type: string
  payload: any
}

export interface ProjectSync {
  project: Project
  sharedFiles?: SharedFile[]
  resources: Array<DeployResourceSync>
  repoInfo: GitInformation | null
}

// The project echoed back in a deploy result: identity fields + timestamps. The
// timestamps are camelCase to match the deployment envelope (the project CRUD
// endpoints return snake_case — see ProjectResponse).
export interface DeployedProject extends Project {
  id: string
  createdAt: string
  updatedAt: string | null
}

export interface ProjectDeployResponse {
  project: DeployedProject
  diff: Array<DiffEntry>
}

export type ProjectDeploymentStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export interface ProjectDeployment {
  id: string
  logicalId: string
  status: ProjectDeploymentStatus
  dryRun: boolean
  /** Opaque progress percentage (0-100). */
  progress: number
  error: { code: string, message: string } | null
  /** The applied { project, diff }; present once the deployment has succeeded. */
  result: ProjectDeployResponse | null
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  /** When cancellation was requested for this deployment, or null if it was not. */
  cancelRequestedAt: string | null
}

export class ProjectDeployFailedError extends Error {
  constructor (message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectDeployFailedError'
  }
}

/** The deployment was cancelled before it finished (e.g. superseded by a newer deploy). */
export class ProjectDeployCancelledError extends Error {
  constructor (message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectDeployCancelledError'
  }
}

/** Internal: the SSE stream ended before a terminal event (eligible for reconnect). */
class DeploymentStreamInterruptedError extends Error {
  constructor () {
    super('The deployment event stream ended before completion.')
    this.name = 'DeploymentStreamInterruptedError'
  }
}

interface SseFrame {
  event: string
  data: any
}

function streamToString (stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.on('error', reject)
  })
}

/** Parse one SSE frame ("event: x\ndata: {...}"), assuming LF line endings.
 * Returns null for keep-alive comments or frames without parseable JSON data. */
function parseSseFrame (raw: string): SseFrame | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) {
      continue // keep-alive comment
    }
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }
  if (dataLines.length === 0) {
    return null
  }
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) }
  } catch {
    return null
  }
}

export interface ImportPlanFilter {
  type: 'include' | 'exclude'
  resource?: {
    type: string
    physicalId?: string | number
  }
}

export interface ImportPlanFriend {
  type: string
  logicalId: string
}

export interface ImportPlanOptions {
  preview?: boolean
  filters?: ImportPlanFilter[]
  friends?: ImportPlanFriend[]
}

export interface ImportPlanChanges {
  resources: ResourceSync[]
  friends?: FriendResourceSync[]
  auxiliary?: AuxiliaryResourceSync[]
}

export interface ImportPlan {
  id: string
  createdAt: string
  appliedAt?: string
  committedAt?: string
  changes?: ImportPlanChanges
}

export class ProjectNotFoundError extends Error {
  logicalId: string

  constructor (logicalId: string, options?: ErrorOptions) {
    super(`Project "${logicalId}" does not exist.`, options)
    this.name = 'ProjectNotFoundError'
    this.logicalId = logicalId
  }
}

export class ProjectAlreadyExistsError extends Error {
  logicalId: string

  constructor (logicalId: string, options?: ErrorOptions) {
    super(`You are already using the logicalId "${logicalId}" for a different project.`, options)
    this.name = 'ProjectAlreadyExistsError'
    this.logicalId = logicalId
  }
}

export class NoImportableResourcesFoundError extends Error {
  constructor (options?: ErrorOptions) {
    super(`No importable resources were found.`, options)
    this.name = 'NoImportableResourcesFoundError'
  }
}

/**
 * The plan a deploy was pinned to no longer describes Checkly's state: a
 * change landed between the preview and the deploy, so the deploy applied
 * nothing. `diff` is the plan as it looks now.
 */
export class ProjectPlanStaleError extends Error {
  readonly diff: DiffEntry[]

  constructor (message: string, diff: DiffEntry[], options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectPlanStaleError'
    this.diff = diff
  }
}

/**
 * A deployment that was already running finished while this one waited for it.
 * Whatever it wrote, it moved the state the plan was computed against, so the
 * plan is stale before the deploy is even attempted — reported here rather
 * than after re-sending the whole payload for a refusal that is certain.
 *
 * A subtype of {@link ProjectPlanStaleError}: callers recover from both the
 * same way, by planning again. It carries no diff, because no new plan has
 * been computed yet.
 */
export class ProjectPlanSupersededError extends ProjectPlanStaleError {
  constructor (options?: ErrorOptions) {
    super(
      'Another deployment of this project finished while this one was waiting for it, '
      + 'so the plan this deploy was pinned to no longer describes your Checkly account.',
      [],
      options,
    )
    this.name = 'ProjectPlanSupersededError'
  }
}

/**
 * The preview could not be computed because another operation is holding the
 * project. Transient: the operation holding it finishes.
 */
export class ProjectPreviewUnavailableError extends Error {
  constructor (message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectPreviewUnavailableError'
  }
}

/**
 * The account's Checkly API does not have the preview endpoint yet (a
 * self-hosted or not-yet-updated backend). Callers fall back to the older,
 * coarser deploy preview.
 */
export class ProjectPreviewNotSupportedError extends Error {
  constructor (options?: ErrorOptions) {
    super('This Checkly API does not support deploy previews.', options)
    this.name = 'ProjectPreviewNotSupportedError'
  }
}

export class ImportPlanNotFoundError extends Error {
  constructor (options?: ErrorOptions) {
    super(`Import plan does not exist.`, options)
    this.name = 'ImportPlanNotFoundError'
  }
}

export class InvalidImportPlanStateError extends Error {
  constructor (options?: ErrorOptions) {
    super(`Invalid state for import plan.`, options)
    this.name = 'InvalidImportPlanStateError'
  }
}

// How long deploy() and deleteProject() will keep waiting-and-retrying behind an
// in-progress operation before giving up and surfacing the 409. Generous, since a
// large predecessor deploy or delete can legitimately run for many minutes.
const DEPLOY_CONFLICT_WAIT_DEADLINE_MS = 30 * 60_000

// A preview conflicts only while something else holds the project, which is
// measured in seconds, so it is retried a few times rather than waited out
// like a deploy's predecessor. The cap keeps a server asking for an
// unreasonable wait from stalling the command instead of failing it.
const PREVIEW_CONFLICT_ATTEMPTS = 3
const PREVIEW_RETRY_AFTER_DEFAULT_MS = 2_000
const PREVIEW_RETRY_AFTER_MAX_MS = 10_000

class Projects {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<ProjectResponse>>('/next/projects')
  }

  /**
   * @throws {ProjectNotFoundError} If the project does not exist.
   */
  async get (logicalId: string) {
    try {
      const logicalIdParam = encodeURIComponent(logicalId)
      return await this.api.get<ProjectResponse>(`/next/projects/${logicalIdParam}`)
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new ProjectNotFoundError(logicalId)
      }

      throw err
    }
  }

  /**
   * @throws {ProjectAlreadyExistsError} If the project already exists.
   */
  async create (project: Project) {
    try {
      return await this.api.post('/next/projects', project)
    } catch (err) {
      if (err instanceof ConflictError) {
        throw new ProjectAlreadyExistsError(project.logicalId)
      }

      throw err
    }
  }

  /**
   * Delete a project. The deletion runs asynchronously on the backend: this
   * submits it, then follows its progress stream to completion, so large projects
   * are no longer bound by the API gateway request timeout. A project that does
   * not exist is treated as already deleted (the endpoint is idempotent).
   *
   * @throws {ProjectDeployFailedError} If the deletion finishes unsuccessfully.
   */
  async deleteProject (
    logicalId: string,
    { preserveResources = false, cancelInProgress = false, onProgress, onStatus }: {
      preserveResources?: boolean
      /**
       * On a 409 (a deploy or delete is already in progress), cancel that
       * operation instead of waiting for it to finish, then retry.
       */
      cancelInProgress?: boolean
      onProgress?: (progress: number) => void
      /** Human-readable status updates (e.g. while waiting on a predecessor). */
      onStatus?: (message: string) => void
    } = {},
  ): Promise<void> {
    // On a 409 the project already has an operation (deploy or delete) in
    // progress. By default we wait for it to reach a final state then retry; with
    // cancelInProgress we cancel it first. Bounded by an overall deadline so a
    // stuck predecessor can't make us wait forever.
    const deadlineAt = Date.now() + DEPLOY_CONFLICT_WAIT_DEADLINE_MS
    for (;;) {
      try {
        await this.submitDeletion(logicalId, { preserveResources, onProgress })
        return
      } catch (err) {
        if (
          !(err instanceof ConflictError)
          || typeof err.data.deploymentId !== 'string'
          || Date.now() >= deadlineAt
        ) {
          throw err
        }
        await this.resolveInProgressDeployment(logicalId, err.data.deploymentId, {
          cancel: cancelInProgress,
          onStatus,
          deadlineAt,
        })
        // loop → re-submit, now that the predecessor has reached a final state
      }
    }
  }

  /**
   * Submit the async delete and follow it to completion. The endpoint responds
   * either with a deployment to follow (202), or — when there is nothing to delete
   * (the project does not exist) — a plain result with no deployment to follow.
   */
  private async submitDeletion (
    logicalId: string,
    { preserveResources, onProgress }: { preserveResources: boolean, onProgress?: (progress: number) => void },
  ): Promise<void> {
    const { data } = await this.api.delete<ProjectDeployResponse | ProjectDeployment>(
      `/v1/projects/${encodeURIComponent(logicalId)}`,
      { params: { preserveResources, dryRun: false } },
    )

    // A missing project completes synchronously with a plain result body and no
    // deployment to follow — already deleted (idempotent).
    if (!('status' in data)) {
      return
    }

    const completed = await this.streamDeploymentEvents(logicalId, data.id, { onProgress })

    if (completed.status === 'CANCELLED') {
      throw new ProjectDeployCancelledError(
        'The deletion was cancelled before it finished. A newer operation may have superseded it.',
      )
    }

    if (completed.status !== 'SUCCEEDED') {
      throw new ProjectDeployFailedError(completed.error?.message ?? 'The deletion did not complete successfully.')
    }
  }

  /**
   * What deploying this payload would change, per resource and per property,
   * without writing anything.
   *
   * The returned `planToken` pins the plan: pass it to {@link deploy} and the
   * deploy refuses if Checkly's state moved in between. A code-side edit
   * between the two is not such a move — the token describes Checkly's state,
   * not the payload — so previewing, editing and deploying still works.
   *
   * @throws {ProjectPreviewNotSupportedError} If the API has no preview endpoint.
   * @throws {ProjectPreviewUnavailableError} If the project stayed busy.
   */
  async preview (
    resources: ProjectSync,
    {
      detail = 'changes',
      preserveResources = false,
      pruneRelations = false,
      onStatus,
    }: {
      detail?: ProjectPreviewDetail
      preserveResources?: boolean
      pruneRelations?: boolean
      /** Human-readable status updates (e.g. while retrying behind another operation). */
      onStatus?: (message: string) => void
    } = {},
  ): Promise<ProjectPreviewResponse> {
    const query = new URLSearchParams({ detail })
    // Only sent when opted in, like deploy's: false is the default and the
    // endpoint's contract is easier to keep stable if the CLI omits defaults.
    if (preserveResources) {
      query.set('preserveResources', 'true')
    }
    if (pruneRelations) {
      query.set('pruneRelations', 'true')
    }

    for (let attempt = 1; ; attempt++) {
      try {
        const { data } = await this.api.post<ProjectPreviewResponse>(
          `/v1/projects/preview?${query.toString()}`,
          resources,
          { transformRequest: compressJSONPayload },
        )
        return data
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new ProjectPreviewNotSupportedError({ cause: err })
        }
        if (!(err instanceof ConflictError)) {
          throw err
        }
        if (attempt >= PREVIEW_CONFLICT_ATTEMPTS) {
          throw new ProjectPreviewUnavailableError(err.data.message, { cause: err })
        }
        const retryAfterMs = Math.min(
          parseRetryAfter(err.data.retryAfter) ?? PREVIEW_RETRY_AFTER_DEFAULT_MS,
          PREVIEW_RETRY_AFTER_MAX_MS,
        )
        onStatus?.('Another operation is holding the project, retrying...')
        await new Promise(resolve => setTimeout(resolve, retryAfterMs))
      }
    }
  }

  /**
   * Deploy a project. The deployment runs asynchronously on the backend: this
   * submits it, then follows its progress stream to completion, so large projects
   * are no longer bound by the API gateway request timeout. A dry run returns the
   * preview diff synchronously without starting a deployment.
   *
   * @throws {ProjectDeployFailedError} If the deployment finishes unsuccessfully.
   */
  async deploy (
    resources: ProjectSync,
    {
      dryRun = false,
      scheduleOnDeploy = true,
      preserveResources = false,
      pruneRelations = false,
      planToken,
      cancelInProgress = false,
      onProgress,
      onStatus,
    }: {
      dryRun?: boolean
      scheduleOnDeploy?: boolean
      /**
       * Keep resources removed from code (and their run history) in the account
       * instead of deleting them.
       */
      preserveResources?: boolean
      /**
       * Delete the alert channel subscriptions and private location assignments
       * on this project's checks and groups that the project does not manage.
       */
      pruneRelations?: boolean
      /**
       * The `planToken` of the preview this deploy was reviewed against. The
       * deploy is refused with {@link ProjectPlanStaleError}, having written
       * nothing, if Checkly's state moved since that preview.
       */
      planToken?: string
      /**
       * On a 409 (another deployment is already in progress), cancel that
       * deployment instead of waiting for it to finish, then retry.
       */
      cancelInProgress?: boolean
      onProgress?: (progress: number) => void
      /** Human-readable status updates (e.g. while waiting on a predecessor). */
      onStatus?: (message: string) => void
    } = {},
  ): Promise<{ data: ProjectDeployResponse }> {
    const logicalId = resources.project.logicalId

    // On a 409 the project already has a deployment in progress. By default we
    // wait for it to finish then retry; with cancelInProgress we cancel it first.
    // resolveInProgressDeployment only returns once the predecessor has reached a
    // final state, so we re-POST the (potentially large) payload exactly once per
    // predecessor — never while it is still running. Bound by an overall deadline
    // so a stuck predecessor can't make us wait forever.
    const deadlineAt = Date.now() + DEPLOY_CONFLICT_WAIT_DEADLINE_MS
    for (;;) {
      try {
        return await this.submitDeployment(resources, {
          dryRun,
          scheduleOnDeploy,
          preserveResources,
          pruneRelations,
          planToken,
          onProgress,
        })
      } catch (err) {
        if (
          dryRun
          || !(err instanceof ConflictError)
          || typeof err.data.deploymentId !== 'string'
          || Date.now() >= deadlineAt
        ) {
          throw err
        }
        const finished = await this.resolveInProgressDeployment(logicalId, err.data.deploymentId, {
          cancel: cancelInProgress,
          onStatus,
          deadlineAt,
        })
        // A predecessor that ran to completion is what invalidates a plan
        // token, so re-POSTing with this one would spend the whole payload on a
        // refusal nobody can act on. Two cases are not that: one we cancelled
        // ourselves (the caller asked to deploy instead of it, and it may well
        // have written nothing), and one still running when the wait gave up —
        // nothing has changed, and the re-POST surfaces the conflict the caller
        // needs to hear about.
        if (planToken !== undefined && !cancelInProgress && finished) {
          throw new ProjectPlanSupersededError({ cause: err })
        }
        // loop → re-POST, now that the predecessor has reached a final state
      }
    }
  }

  private async submitDeployment (
    resources: ProjectSync,
    { dryRun, scheduleOnDeploy, preserveResources, pruneRelations, planToken, onProgress }: {
      dryRun: boolean
      scheduleOnDeploy: boolean
      preserveResources: boolean
      pruneRelations: boolean
      planToken?: string
      onProgress?: (progress: number) => void
    },
  ): Promise<{ data: ProjectDeployResponse }> {
    // Only send preserveResources when the user opted in. The endpoint rejects
    // unknown query params, and preserveResources=false is the default (delete)
    // behavior, so omitting it keeps default deploys backwards compatible.
    // pruneRelations and planToken are omitted for the same reason: an older
    // API knows neither.
    const preserveParam = preserveResources ? '&preserveResources=true' : ''
    const pruneParam = pruneRelations ? '&pruneRelations=true' : ''
    const tokenParam = planToken ? `&planToken=${encodeURIComponent(planToken)}` : ''
    const { data } = await this.api.post<ProjectDeployResponse | ProjectDeployment>(
      `/v1/projects/deploy?dryRun=${dryRun}&scheduleOnDeploy=${scheduleOnDeploy}`
      + `${preserveParam}${pruneParam}${tokenParam}`,
      resources,
      { transformRequest: compressJSONPayload },
    )

    // A dry run responds synchronously with the preview diff.
    if (dryRun) {
      return { data: data as ProjectDeployResponse }
    }

    // A real deploy responds with a deployment to follow to completion.
    const deployment = data as ProjectDeployment
    const completed = await this.streamDeploymentEvents(resources.project.logicalId, deployment.id, { onProgress })

    if (completed.status === 'CANCELLED') {
      throw new ProjectDeployCancelledError(
        'A newer deployment may have cancelled yours. Try deploying again if you still need to apply your changes.',
      )
    }

    // A refused plan is not a failed deploy: nothing was written, and the
    // deployment carries the plan as it looks now so the caller can show what
    // moved instead of a bare error.
    if (completed.error?.code === 'PLAN_STALE') {
      throw new ProjectPlanStaleError(completed.error.message, completed.result?.diff ?? [])
    }

    if (completed.status !== 'SUCCEEDED' || completed.result === null) {
      throw new ProjectDeployFailedError(completed.error?.message ?? 'The deployment did not complete successfully.')
    }

    return { data: completed.result }
  }

  /**
   * Resolve a collision with an in-progress deployment so the caller can retry:
   * optionally cancel it, then wait until it reaches a final state (or is gone)
   * before returning — so the caller re-POSTs only when the slot is actually
   * free, never re-uploading the payload while the predecessor is still running.
   *
   * @returns Whether the predecessor was observed to reach a final state.
   * `false` means the wait hit its deadline with the predecessor still running,
   * which is a different situation for the caller: nothing has changed, so a
   * plan computed before the wait still stands, and re-POSTing surfaces the
   * conflict the caller needs to hear about.
   */
  private async resolveInProgressDeployment (
    logicalId: string,
    deploymentId: string,
    { cancel, onStatus, deadlineAt }: { cancel: boolean, onStatus?: (message: string) => void, deadlineAt: number },
  ): Promise<boolean> {
    if (cancel) {
      onStatus?.('Cancelling an in-progress deployment...')
      try {
        await this.cancelDeployment(logicalId, deploymentId)
      } catch (err) {
        // Already gone → nothing to cancel; proceed to retry.
        if (!(err instanceof NotFoundError)) {
          throw err
        }
        return true
      }
    } else {
      onStatus?.('Waiting for an in-progress deployment to finish...')
    }

    // Poll the completion endpoint until the predecessor is final. Pacing comes
    // from the server-side long-poll (~maxWaitSeconds per call), so this is not a
    // busy loop; the deadline bounds the total wait.
    for (;;) {
      try {
        await this.awaitDeploymentCompletion(logicalId, deploymentId)
        return true // reached a final state → slot free
      } catch (err) {
        if (err instanceof NotFoundError) {
          return true // gone → slot free
        }
        // 408 = still running after the long-poll window. Keep waiting unless the
        // overall deadline has passed, in which case return and let the caller
        // re-POST once and surface the conflict.
        if (err instanceof RequestTimeoutError) {
          if (Date.now() >= deadlineAt) {
            return false
          }
          continue
        }
        throw err
      }
    }
  }

  getDeployment (logicalId: string, deploymentId: string) {
    return this.api.get<ProjectDeployment>(
      `/v1/projects/${encodeURIComponent(logicalId)}/deployments/${encodeURIComponent(deploymentId)}`,
    )
  }

  /** Request cancellation of an in-flight deployment (idempotent on the server). */
  cancelDeployment (logicalId: string, deploymentId: string) {
    return this.api.post<ProjectDeployment>(
      `/v1/projects/${encodeURIComponent(logicalId)}/deployments/${encodeURIComponent(deploymentId)}/cancel`,
    )
  }

  /**
   * Long-poll the completion endpoint once: the server blocks up to
   * `maxWaitSeconds` and returns the deployment when it reaches a final state, or
   * 408 (`RequestTimeoutError`) if it is still running when that window elapses.
   * The retry cadence lives in the caller, not here.
   */
  async awaitDeploymentCompletion (
    logicalId: string,
    deploymentId: string,
    { maxWaitSeconds = 30 }: { maxWaitSeconds?: number } = {},
  ): Promise<ProjectDeployment> {
    const { data } = await this.api.get<ProjectDeployment>(
      `/v1/projects/${encodeURIComponent(logicalId)}/deployments/${encodeURIComponent(deploymentId)}/completion`,
      { params: { maxWaitSeconds } },
    )
    return data
  }

  /**
   * Follow a deployment to completion over its Server-Sent Events stream,
   * invoking `onProgress` as progress frames arrive and resolving with the final
   * deployment on the terminal `complete` frame. If the stream drops before a
   * terminal frame (a transient network blip), it reconnects up to `maxReconnects`
   * times — the server is stateless and re-reads current state, so resuming needs
   * no cursor.
   */
  async streamDeploymentEvents (
    logicalId: string,
    deploymentId: string,
    { onProgress, maxReconnects = 5 }: { onProgress?: (progress: number) => void, maxReconnects?: number } = {},
  ): Promise<ProjectDeployment> {
    let reconnects = 0
    for (;;) {
      try {
        return await this.consumeEventStream(logicalId, deploymentId, onProgress)
      } catch (err) {
        if (err instanceof DeploymentStreamInterruptedError && reconnects < maxReconnects) {
          reconnects += 1
          continue
        }
        throw err
      }
    }
  }

  private async openEventStream (logicalId: string, deploymentId: string): Promise<Readable> {
    try {
      const { data } = await this.api.get<Readable>(
        `/v1/projects/${encodeURIComponent(logicalId)}/deployments/${encodeURIComponent(deploymentId)}/events`,
        { responseType: 'stream', headers: { Accept: 'text/event-stream' } },
      )
      return data
    } catch (err) {
      // On an HTTP error the body arrives as an unparsed stream (responseType
      // 'stream'), so the response interceptor couldn't classify it. Buffer it and
      // re-run the classifier to surface the typed error (NotFoundError, etc.).
      if (isAxiosError(err) && err.response && err.response.data instanceof Readable) {
        err.response.data = await streamToString(err.response.data)
        handleErrorResponse(err)
      }
      throw err
    }
  }

  private async consumeEventStream (
    logicalId: string,
    deploymentId: string,
    onProgress?: (progress: number) => void,
  ): Promise<ProjectDeployment> {
    const stream = await this.openEventStream(logicalId, deploymentId)

    return new Promise<ProjectDeployment>((resolve, reject) => {
      let buffer = ''
      let settled = false
      const settle = (action: () => void) => {
        if (settled) {
          return
        }
        settled = true
        stream.destroy()
        action()
      }

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const frame = parseSseFrame(buffer.slice(0, boundary))
          buffer = buffer.slice(boundary + 2)
          if (frame?.event === 'progress') {
            if (onProgress !== undefined && typeof frame.data?.progress === 'number') {
              onProgress(frame.data.progress)
            }
          } else if (frame?.event === 'complete') {
            settle(() => resolve(frame.data as ProjectDeployment))
          } else if (frame?.event === 'error') {
            const message = typeof frame.data?.message === 'string'
              ? frame.data.message
              : 'The deployment event stream reported an error.'
            settle(() => reject(new ProjectDeployFailedError(message)))
          }
          boundary = buffer.indexOf('\n\n')
        }
      })
      // Both a clean EOF before a terminal frame and a socket error (the common
      // mid-deploy drop, e.g. ECONNRESET) are interruptions eligible for reconnect.
      stream.on('end', () => settle(() => reject(new DeploymentStreamInterruptedError())))
      stream.on('error', () => settle(() => reject(new DeploymentStreamInterruptedError())))
    })
  }

  /**
   * @throws {ProjectNotFoundError} If the project does not exist.
   * @throws {NoImportableResourcesFoundError} If no importable resources were found.
   */
  async createImportPlan (logicalId: string, options?: ImportPlanOptions) {
    const payload = {
      filters: options?.filters,
      friends: options?.friends,
    }
    try {
      const logicalIdParam = encodeURIComponent(logicalId)
      return await this.api.post<ImportPlan>(`/next/projects/${logicalIdParam}/imports`, payload, {
        params: {
          preview: options?.preview ?? false,
        },
      })
    } catch (err) {
      if (err instanceof NotFoundError) {
        if (/No importable resources were found/i.test(err.data.message)) {
          throw new NoImportableResourcesFoundError()
        }

        throw new ProjectNotFoundError(logicalId)
      }

      throw err
    }
  }

  /**
   * @throws {ProjectNotFoundError} If the project does not exist.
   */
  async findImportPlans (logicalId: string, { onlyUnapplied = false, onlyUncommitted = false } = {}) {
    try {
      const logicalIdParam = encodeURIComponent(logicalId)
      return await this.api.get<ImportPlan[]>(`/next/projects/${logicalIdParam}/imports`, {
        params: {
          onlyUnapplied,
          onlyUncommitted,
        },
      })
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new ProjectNotFoundError(logicalId)
      }

      throw err
    }
  }

  listImportPlans ({ onlyUnapplied = false, onlyUncommitted = false } = {}) {
    return this.api.get<ImportPlan[]>('/next/projects/imports', {
      params: {
        onlyUnapplied,
        onlyUncommitted,
      },
    })
  }

  /**
   * @throws {ImportPlanNotFoundError} If the import plan does not exist.
   * @throws {InvalidImportPlanStateError} If the operation is performed out of order.
   */
  async cancelImportPlan (importPlanId: string) {
    try {
      return await this.api.delete<void>(`/next/projects/imports/${importPlanId}`)
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new InvalidImportPlanStateError()
      }

      if (err instanceof NotFoundError) {
        throw new ImportPlanNotFoundError()
      }

      throw err
    }
  }

  /**
   * @throws {ImportPlanNotFoundError} If the import plan does not exist.
   * @throws {InvalidImportPlanStateError} If the operation is performed out of order.
   */
  async applyImportPlan (importPlanId: string) {
    try {
      return await this.api.post<void>(`/next/projects/imports/${importPlanId}/apply`)
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new InvalidImportPlanStateError()
      }

      if (err instanceof NotFoundError) {
        throw new ImportPlanNotFoundError()
      }

      throw err
    }
  }

  /**
   * @throws {ImportPlanNotFoundError} If the import plan does not exist.
   * @throws {InvalidImportPlanStateError} If the operation is performed out of order.
   */
  async commitImportPlan (importPlanId: string) {
    try {
      return await this.api.post<void>(`/next/projects/imports/${importPlanId}/commit`)
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new InvalidImportPlanStateError()
      }

      if (err instanceof NotFoundError) {
        throw new ImportPlanNotFoundError()
      }

      throw err
    }
  }
}

export default Projects
