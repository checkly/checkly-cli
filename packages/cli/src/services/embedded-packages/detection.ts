import axios from 'axios'
import Debug from 'debug'
import PQueue from 'p-queue'

import { assignProxy } from '../proxy.js'
import { integrityIntersects, shasumToIntegrity } from './integrity.js'
import { LockfileDependencyGraph, LockfileRegistryPackage } from './lockfile-packages.js'
import { DEFAULT_REGISTRY_URL, NpmrcConfig, resolveAuthHeader, resolveRegistryUrl } from './npmrc.js'

const debug = Debug('checkly:cli:services:embedded-packages')

export const PUBLIC_REGISTRY_URL = DEFAULT_REGISTRY_URL

// registry.yarnpkg.com is a long-standing alias serving the same artifacts.
const PUBLIC_REGISTRY_HOSTS = new Set(['registry.npmjs.org', 'registry.yarnpkg.com'])

const API_TIMEOUT_MS = 30_000
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024
const DETECTION_CONCURRENCY = 10

function isPublicRegistryUrl (url: string): boolean {
  try {
    return PUBLIC_REGISTRY_HOSTS.has(new URL(url).host)
  } catch {
    return false
  }
}

export interface ClassifiedEntries {
  /** Provably resolves from the public registry — never embed. */
  public: LockfileRegistryPackage[]
  /**
   * Resolves from a non-public registry through an explicit scope mapping —
   * embed without any lookup. Over-embedding is allowed by the bundle
   * contract, and scoped registries overwhelmingly host private packages.
   */
  embed: LockfileRegistryPackage[]
  /**
   * Cannot be decided from configuration alone (a non-public *default*
   * registry may proxy public packages verbatim) — needs the private
   * registry's API, or the opt-in public-registry fallback, to decide.
   */
  undecided: LockfileRegistryPackage[]
}

/**
 * Classifies lockfile registry entries by what npm configuration alone can
 * prove, without any network traffic.
 */
export function classifyEntries (
  entries: LockfileRegistryPackage[],
  npmrcConfig: NpmrcConfig,
  env: NodeJS.ProcessEnv = process.env,
): ClassifiedEntries {
  const result: ClassifiedEntries = { public: [], embed: [], undecided: [] }

  for (const entry of entries) {
    // A lockfile-recorded public tarball URL (package-lock.json `resolved`)
    // names the artifact's actual source and proves publicness.
    if (entry.tarballUrl !== undefined && isPublicRegistryUrl(entry.tarballUrl)) {
      result.public.push(entry)
      continue
    }

    // A scope explicitly mapped to a non-public registry marks the package
    // private regardless of any recorded non-public source — npm lockfiles
    // record `resolved` for every entry, and this must not defeat the
    // zero-network scope tier.
    const scope = entry.name.startsWith('@') ? entry.name.slice(0, entry.name.indexOf('/')) : undefined
    const scopeMapped = scope !== undefined
      && (npmrcConfig.has(`${scope}:registry`) || npmrcConfig.has(`${scope.toLowerCase()}:registry`))
    let registryUrl: string
    try {
      registryUrl = resolveRegistryUrl(npmrcConfig, entry.name, env)
    } catch (err) {
      // E.g. an unset ${VAR} in this entry's registry mapping. A
      // scope-mapped entry stays in the no-lookup embed tier — an
      // explicit @scope:registry mapping that fails to expand is never
      // the public registry (the default needs no variable), and
      // 'undecided' could transmit the private name under the opt-in.
      // Others become undecided instead of aborting classification.
      debug('classify %s: cannot resolve registry: %s', entry.name, (err as Error).message)
      if (scopeMapped) {
        result.embed.push(entry)
      } else {
        result.undecided.push(entry)
      }
      continue
    }
    if (scopeMapped && !isPublicRegistryUrl(registryUrl)) {
      result.embed.push(entry)
      continue
    }

    // A non-public recorded source cannot be vouched for by registry
    // configuration: the artifact may be a proxied public package or a
    // private one.
    if (entry.tarballUrl !== undefined) {
      result.undecided.push(entry)
      continue
    }

    if (isPublicRegistryUrl(registryUrl)) {
      result.public.push(entry)
      continue
    }

    result.undecided.push(entry)
  }

  return result
}

export type DetectionVerdict = 'public' | 'embed'

/**
 * The `name@version` identity of a registry entry in the lockfile's
 * dependency graph. Distinct from {@link verdictKey}: graph keys identify
 * tree positions, verdict keys pin artifacts (they include the integrity).
 */
export function graphKey (entry: LockfileRegistryPackage): string {
  return `${entry.name}@${entry.version}`
}

/**
 * The shared state one detection run's graph propagation accumulates.
 * All key sets are in {@link graphKey} space.
 */
export interface PropagationContext {
  graph: LockfileDependencyGraph
  /**
   * Entries proven public: the zero-network configuration tier, cached
   * diff verdicts, and diff proofs as rounds complete. Assumed-public
   * entries join this set too — an assumption propagates onward — but
   * only proofs are ever persisted (the caller enforces that).
   */
  publicKeys: Set<string>
  /**
   * Entries decided embed: scope mapping, the explicit list, cached and
   * fresh verdicts. Children of these are the private subtrees whose
   * surface must be verified rather than assumed.
   */
  embedKeys: Set<string>
  /**
   * Names with any evidence of privateness — explicitly listed names,
   * scope-mapped names, and names any verdict proved private. No version
   * of such a name is ever assumed public: a name known to have private
   * versions is exactly where a public parent's vouching is least
   * trustworthy (a shadowed name or private fork).
   */
  privateNames: Set<string>
  /**
   * How many entries the run decided by assumption rather than proof.
   * A run that assumed anything must not cache its summary: the
   * assumptions must be re-derived — and replaced by real verdicts once
   * the private registry becomes interrogable — on the next run.
   */
  assumedCount: number
  /**
   * Names with several still-undecided versions anywhere in the run —
   * computed run-wide, because detection groups are processed
   * sequentially and a per-group view would miss a sibling version
   * living in another group. No version of such a name is ever assumed
   * (a sibling's verdict may prove the name private); the set is not
   * shrunk as verdicts land, so late versions become stall breakers and
   * are verified instead.
   */
  multiUndecidedNames: Set<string>
}

/**
 * Records graph-space private evidence for an entry proven (or configured)
 * private: the single place the embed-key and private-name invariants are
 * kept in sync.
 */
export function recordEmbedEvidence (context: PropagationContext, entry: LockfileRegistryPackage): void {
  context.embedKeys.add(graphKey(entry))
  context.privateNames.add(entry.name)
}

export interface PropagationRound {
  /**
   * Undecided entries with a public parent: assumed public without a
   * lookup. Not a proof — a private artifact shadowing a public name
   * under a public parent would be missed (the runner's lockfile
   * integrity check then fails the install loudly) — so these verdicts
   * must never enter the persistent verdict cache.
   */
  assumed: LockfileRegistryPackage[]
  /**
   * Undecided entries nothing can vouch for: workspace-direct
   * dependencies, children of embedded packages, versions of names with
   * known private versions, and entries with no registry parent at all
   * (including dependencies of git/file/link parents). These need actual
   * verification. Entries whose parents are themselves still undecided
   * are deliberately absent — their parents' verdicts may settle them in
   * a later round.
   */
  frontier: LockfileRegistryPackage[]
  /**
   * Entries a proven-public parent reaches but that cannot be assumed —
   * an undecided parent (typically a dependency cycle) or several
   * undecided versions of one name. When neither the frontier nor
   * assumption makes progress, querying these minimally breaks the
   * stall: their verdicts unlock their deferred descendants for
   * assumption, instead of the whole remainder being sent to the
   * registry.
   */
  stallBreakers: LockfileRegistryPackage[]
}

/**
 * Plans one round of graph propagation over the still-undecided entries:
 * what a public parent vouches for, and what must be verified now.
 * Public packages declare their dependencies publicly, so a package
 * reachable through a provably public parent is public in the vast
 * majority of cases — assuming it avoids transmitting its name anywhere
 * and collapses the public-diff request count from the whole tree to the
 * frontier of the private subtrees.
 */
export function planPropagationRound (
  undecided: LockfileRegistryPackage[],
  context: PropagationContext,
): PropagationRound {
  const { graph, publicKeys, embedKeys, privateNames, multiUndecidedNames } = context
  const undecidedByKey = new Map(undecided.map(entry => [graphKey(entry), entry]))

  // Which undecided keys have a decidable parent, which have an embedded,
  // public, or still-undecided one — the only facts about parents the
  // rules below need. Only parents this run can reach a verdict for
  // count: a child whose parents are all outside that universe (a
  // git/file dependency, an integrity-less entry) is effectively
  // parentless — nothing will ever vouch for it.
  const hasParent = new Set<string>()
  const embedChildren = new Set<string>()
  const publicChildren = new Set<string>()
  const undecidedParentChildren = new Set<string>()
  for (const [source, targets] of graph.edges) {
    if (!publicKeys.has(source) && !embedKeys.has(source) && !undecidedByKey.has(source)) {
      continue
    }
    const sourceEmbedded = embedKeys.has(source)
    const sourcePublic = publicKeys.has(source)
    const sourceUndecided = undecidedByKey.has(source)
    for (const target of targets) {
      hasParent.add(target)
      if (sourceEmbedded) {
        embedChildren.add(target)
      }
      if (sourcePublic) {
        publicChildren.add(target)
      }
      if (sourceUndecided) {
        undecidedParentChildren.add(target)
      }
    }
  }

  // Exposure wins over assumption: a root, a child of an embedded
  // package, or any version of a name with known private versions is
  // always verified even when a public package also depends on it — those
  // are exactly the places a privately patched fork of a public name
  // lives, and only verification catches it.
  const isExposed = (key: string, name: string): boolean =>
    graph.roots.has(key) || !hasParent.has(key) || embedChildren.has(key) || privateNames.has(name)

  // Assumption reaches exactly one layer per plan: the direct children of
  // already-public keys (deeper descendants still have an undecided
  // parent). The caller applies a layer and re-plans, so the closure
  // builds up across rounds — with every parent's verdict in hand before
  // its children are considered, because a pending parent verdict may
  // prove it private, which must expose the child rather than let a
  // public co-parent assume it away.
  const round: PropagationRound = { assumed: [], frontier: [], stallBreakers: [] }
  for (const [key, entry] of undecidedByKey) {
    if (isExposed(key, entry.name)) {
      round.frontier.push(entry)
      continue
    }
    if (!publicChildren.has(key)) {
      // Nothing public reaches it yet; its parents' verdicts settle it in
      // a later round (or the caller's last resort queries it).
      continue
    }
    if (!undecidedParentChildren.has(key) && !multiUndecidedNames.has(entry.name)) {
      round.assumed.push(entry)
    } else {
      round.stallBreakers.push(entry)
    }
  }
  return round
}

/**
 * Thrown when a detection tier cannot produce verdicts. Always handled by
 * the caller as "detection degraded" (a warning, never a failed run).
 */
export class DetectionUnavailableError extends Error {
  /**
   * Verdicts the public-registry diff had already collected when the
   * failure occurred, so callers can distinguish decided entries from
   * genuinely skipped ones. May mix integrity proofs with graph-assumed
   * publics — the diff persists the proven subset itself as its rounds
   * complete (every transmitted package name should yield a durable
   * verdict, so a retry never sends the same name again); callers only
   * APPLY this map, never persist it.
   */
  partialVerdicts?: Map<LockfileRegistryPackage, DetectionVerdict>

  /**
   * True when granting the configured npm credentials access to the
   * registry's REST API could plausibly fix the failure. Drives whether
   * the degraded-run warning suggests that remedy — advice that would
   * only mislead for failures unrelated to REST permissions.
   */
  restAccessRemediable?: boolean

  constructor (message: string, options?: ErrorOptions & { restAccessRemediable?: boolean }) {
    super(message, options)
    this.name = 'DetectionUnavailableError'
    this.restAccessRemediable = options?.restAccessRemediable
  }
}

async function apiGet (url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await axios.get(url, assignProxy(url, {
    headers,
    timeout: API_TIMEOUT_MS,
    maxContentLength: MAX_RESPONSE_BYTES,
  }))
  return response.data
}

/**
 * Parses a Sonatype Nexus content URL (`<instance>/repository/<repo>/...`)
 * into its instance base and repository name — the single home of the
 * Nexus URL-shape assumption. Undefined for other layouts.
 */
export function parseNexusContentUrl (url: string): { instanceBase: string, repoName: string } | undefined {
  const marker = '/repository/'
  const index = url.indexOf(marker)
  if (index === -1) {
    return undefined
  }
  const repoName = url.slice(index + marker.length).split('/')[0]
  if (repoName === '') {
    return undefined
  }
  return { instanceBase: url.slice(0, index), repoName }
}

/**
 * The repository content base of a Nexus-shaped URL
 * (`<instance>/repository/<repo>/`), or undefined for other layouts.
 */
export function nexusContentBase (url: string): string | undefined {
  const parsed = parseNexusContentUrl(url)
  if (parsed === undefined) {
    return undefined
  }
  return `${parsed.instanceBase}/repository/${parsed.repoName}/`
}

/**
 * Interrogates the private registry (Sonatype Nexus Repository) about
 * which packages it hosts, using only endpoints of the registry the
 * project already talks to — private package names are never sent
 * anywhere else. Credentials are the ones `.npmrc` holds for the
 * registry's content endpoints; instances commonly accept them for the
 * REST API too, and any refusal degrades to the configured fallback.
 */
export class NexusRegistryApi {
  #restBase: string
  #sourceRepoName: string
  #authHeader?: string

  constructor (restBase: string, sourceRepoName: string, authHeader?: string) {
    this.#restBase = restBase
    this.#sourceRepoName = sourceRepoName
    this.#authHeader = authHeader
  }

  /**
   * Derives the instance's REST base from an npm registry URL: Nexus
   * content URLs have the shape `<instance>/repository/<repo-name>/`, so
   * everything before `/repository/` is the instance base (which may
   * include a context path). Returns undefined for URLs without that
   * shape (not Nexus, or an unsupported layout).
   */
  static forRegistry (
    registryUrl: string,
    npmrcConfig: NpmrcConfig,
    env: NodeJS.ProcessEnv,
  ): NexusRegistryApi | undefined {
    const parsed = parseNexusContentUrl(registryUrl)
    if (parsed === undefined) {
      return undefined
    }
    const restBase = `${parsed.instanceBase}/service/rest/v1`
    return new NexusRegistryApi(restBase, parsed.repoName, resolveAuthHeader(npmrcConfig, registryUrl, env))
  }

  /**
   * Key for per-run memoization of listings/inventories: the listing is
   * permission-filtered, so results are only shareable between groups
   * using the same instance AND the same credentials.
   */
  get cacheKey (): string {
    return `${this.#restBase}\0${this.#authHeader ?? ''}`
  }

  async #get (path: string): Promise<unknown> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (this.#authHeader !== undefined) {
      headers.authorization = this.#authHeader
    }
    return await apiGet(`${this.#restBase}${path}`, headers)
  }

  /**
   * The instance's (permission-filtered) repository listing. Split from
   * the inventory so that callers sharing one instance across groups can
   * memoize the expensive parts per instance while still running
   * {@link assertSourceRepoVisible} for each group's own source repo.
   */
  async listRepositories (): Promise<unknown[]> {
    let repositories: unknown
    try {
      repositories = await this.#get('/repositories')
    } catch (err) {
      throw new DetectionUnavailableError(
        `The registry's REST API is not accessible with the configured npm credentials`,
        { cause: err, restAccessRemediable: true },
      )
    }

    if (!Array.isArray(repositories)) {
      throw new DetectionUnavailableError(`The registry's repository listing has an unexpected shape`)
    }

    return repositories
  }

  /**
   * The listing is permission-filtered per repository. If it does not
   * even include the repository this group installs from, we are clearly
   * not seeing everything, and an absent hosted repo cannot be taken as
   * proof that nothing is privately hosted.
   */
  assertSourceRepoVisible (repositories: unknown[]): void {
    if (!repositories.some((repo: any) => repo?.name === this.#sourceRepoName)) {
      throw new DetectionUnavailableError(
        `The registry's repository listing does not include '${this.#sourceRepoName}',`
        + ` so it appears to be filtered by permissions`,
        { restAccessRemediable: true },
      )
    }
  }

  async hostedInventory (repositories: unknown[]): Promise<Set<string>> {
    const hostedNpmRepos = repositories
      .filter((repo: any): repo is { name: string } =>
        typeof repo?.name === 'string' && repo?.format === 'npm' && repo?.type === 'hosted')
      .map(repo => repo.name)

    // Zero visible hosted npm repositories is indistinguishable from a
    // permission-filtered listing, and treating it as "nothing is
    // privately hosted" would silently under-embed — the one harmful
    // direction. Degrade instead; a genuinely hosted-free instance's users
    // see the warning once and pick a remedy.
    if (hostedNpmRepos.length === 0) {
      throw new DetectionUnavailableError(
        `No npm hosted repositories are visible to the configured credentials —`
        + ` either none exist or the repository listing is permission-filtered`,
        { restAccessRemediable: true },
      )
    }

    debug('nexus: npm hosted repositories: %j', hostedNpmRepos)

    const inventory = new Set<string>()
    // Page guard per registry instance: hosted npm repos hold curated
    // private packages, not mirrors of the world. An instance bigger than
    // this fails fast (~50 requests) rather than being walked on every
    // run, and a truncated inventory is never passed off as authoritative.
    const maxPages = 50
    let pagesUsed = 0
    for (const repoName of hostedNpmRepos) {
      let continuationToken: string | undefined
      while (true) {
        if (pagesUsed >= maxPages) {
          throw new DetectionUnavailableError(
            `The registry has more hosted components than detection is prepared to enumerate`,
          )
        }
        pagesUsed++
        const query = continuationToken !== undefined
          ? `&continuationToken=${encodeURIComponent(continuationToken)}`
          : ''
        let response: any
        try {
          response = await this.#get(`/components?repository=${encodeURIComponent(repoName)}${query}`)
        } catch (err) {
          throw new DetectionUnavailableError(
            `Listing components of repository '${repoName}' failed`,
            { cause: err, restAccessRemediable: true },
          )
        }
        const items = response?.items
        if (!Array.isArray(items)) {
          throw new DetectionUnavailableError(
            `The component listing of repository '${repoName}' has an unexpected shape`,
          )
        }

        for (const item of items) {
          if (item?.format !== 'npm' || typeof item?.version !== 'string') {
            continue
          }
          for (const asset of Array.isArray(item.assets) ? item.assets : []) {
            // The npm metadata on the asset carries the full (scoped)
            // package name; fall back to reassembling it from the
            // component's group/name split.
            const name: unknown = asset?.npm?.name
              ?? (typeof item.group === 'string' && item.group !== ''
                ? `@${item.group}/${item.name}`
                : item.name)
            if (typeof name !== 'string') {
              continue
            }
            inventory.add(`${name}@${item.version}`)
          }
        }

        continuationToken = typeof response?.continuationToken === 'string'
          ? response.continuationToken
          : undefined
        if (continuationToken === undefined) {
          break
        }
      }
    }

    debug('nexus: %d hosted npm package versions', inventory.size)

    return inventory
  }
}

/**
 * Decides undecided entries against the private registry's hosted
 * inventory: a `name@version` present in a hosted repository is private —
 * embed it; one absent from every hosted repository necessarily arrived
 * through a proxy of the public registry — public.
 */
export function decideWithHostedInventory (
  entries: LockfileRegistryPackage[],
  inventory: Set<string>,
): Map<LockfileRegistryPackage, DetectionVerdict> {
  const verdicts = new Map<LockfileRegistryPackage, DetectionVerdict>()
  for (const entry of entries) {
    const hosted = inventory.has(`${entry.name}@${entry.version}`)
    verdicts.set(entry, hosted ? 'embed' : 'public')
    debug('detect %s@%s: %s (registry api)', entry.name, entry.version, verdicts.get(entry))
  }
  return verdicts
}

interface PackumentVersionDist {
  integrity?: string
  shasum?: string
}

export interface DiffOptions {
  /** Public registry base URL; tests point this at a local server. */
  publicRegistryUrl?: string
}

/**
 * The opt-in fallback: decides undecided entries by comparing their
 * lockfile integrity against the public registry's metadata, one
 * abbreviated packument per unique name. A package is public only when the
 * exact version exists publicly with a provably identical artifact;
 * anything else — the name or version missing, or the integrity
 * incomparable or different (a shadowed name or private fork) — means
 * embed.
 *
 * This necessarily transmits the queried package names — including
 * private ones — to the public registry, which is why it never runs
 * unless `checks.detectEmbeddedPackagesFallback` is set to
 * `'public-registry'`.
 */
export async function diffAgainstPublicRegistry (
  entries: LockfileRegistryPackage[],
  options: DiffOptions = {},
): Promise<Map<LockfileRegistryPackage, DetectionVerdict>> {
  const registryUrl = options.publicRegistryUrl ?? PUBLIC_REGISTRY_URL

  const byName = new Map<string, LockfileRegistryPackage[]>()
  for (const entry of entries) {
    const group = byName.get(entry.name) ?? []
    group.push(entry)
    byName.set(entry.name, group)
  }

  const verdicts = new Map<LockfileRegistryPackage, DetectionVerdict>()
  const queue = new PQueue({ concurrency: DETECTION_CONCURRENCY })

  let failure: unknown
  await queue.addAll([...byName.entries()].map(([name, group]) => async () => {
    // Once one lookup fails the fallback is abandoned: tasks that have not
    // fetched yet return without sending their package name. (Clearing the
    // queue instead would leave the cleared tasks' promises unsettled and
    // hang addAll forever.) The verdicts collected so far still travel
    // with the failure — discarding them would force the next run to
    // re-transmit the same names for nothing.
    if (failure !== undefined) {
      return
    }
    try {
      const versions = await fetchPackumentVersions(registryUrl, name)
      for (const entry of group) {
        const dist = versions?.[entry.version]
        // Field types are unvalidated registry data; a malformed value must
        // become a recorded failure, never an unhandled throw.
        const publicIntegrity = [
          typeof dist?.integrity === 'string' ? dist.integrity : undefined,
          typeof dist?.shasum === 'string' ? shasumToIntegrity(dist.shasum) : undefined,
        ]
          .filter((value): value is string => value !== undefined)
          .join(' ')
        const isPublic = publicIntegrity !== '' && integrityIntersects(entry.integrity, publicIntegrity)
        verdicts.set(entry, isPublic ? 'public' : 'embed')
        debug('detect %s@%s: %s (public registry diff)', entry.name, entry.version, verdicts.get(entry))
      }
    } catch (err) {
      failure ??= err
    }
  }))

  if (failure !== undefined) {
    const err = failure instanceof DetectionUnavailableError
      ? failure
      : new DetectionUnavailableError(
          `The public registry diff failed unexpectedly`, { cause: failure })
    err.partialVerdicts = verdicts
    throw err
  }

  return verdicts
}

async function fetchPackumentVersions (
  registryUrl: string,
  name: string,
): Promise<Record<string, PackumentVersionDist | undefined> | undefined> {
  const url = `${registryUrl}${name.replace('/', '%2F')}`
  let data: any
  try {
    const response = await axios.get(url, assignProxy(url, {
      headers: {
        // The abbreviated "install" packument: much smaller, still carries
        // per-version dist integrity.
        accept: 'application/vnd.npm.install-v1+json',
      },
      timeout: API_TIMEOUT_MS,
      maxContentLength: MAX_RESPONSE_BYTES,
      validateStatus: status => status === 200 || status === 404,
    }))
    if (response.status === 404) {
      return undefined
    }
    data = response.data
  } catch (err) {
    throw new DetectionUnavailableError(
      `The public npm registry is not reachable for the detection fallback`,
      { cause: err },
    )
  }

  // A 200 that is not a packument (an interfering proxy, a captive portal)
  // must not silently count as "nothing exists publicly": that would mark
  // every package as private and poison the verdict cache.
  if (typeof data?.versions !== 'object' || data.versions === null) {
    throw new DetectionUnavailableError(
      `The public registry returned an unexpected response for a package metadata request`,
    )
  }

  const versions: Record<string, { dist?: PackumentVersionDist }> = data.versions
  return Object.fromEntries(Object.entries(versions).map(([version, meta]) => [version, meta?.dist]))
}
