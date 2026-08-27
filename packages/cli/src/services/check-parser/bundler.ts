import { once } from 'node:events'
import { createReadStream, createWriteStream, WriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { AxiosResponse } from 'axios'
import type { Archiver } from 'archiver'
import Debug from 'debug'
import * as uuid from 'uuid'

import { createHash } from 'node:crypto'

import { checklyStorage } from '../../rest/api.js'
import { PayloadTooLargeError } from '../../rest/errors.js'
import { EMBEDDED_PACKAGES_ARCHIVE_DIR, EmbeddedPackagesMaterializer, PlannedTarball } from '../embedded-packages/materializer.js'
import { filterTarballsByLockfile } from '../embedded-packages/lockfile-filter.js'
import {
  composeWorkspaceCacheHash,
  ComposeWorkspaceCacheHashOptions,
  ComputeWorkspaceCacheHashOptions,
  EmbeddedPackageInput,
  FauxPackageJsonInput,
  canonicalizePackageJson,
  loadWorkspaceCacheHashInputs,
  LockfileInput,
  PACKAGE_JSON_EXCLUDED_FIELDS,
} from './cache-hash.js'
import { lockfileArchivePath, manifestArchivePath, pruneBundledLockfile } from './lockfile-pruner.js'
import {
  BundlePackagesPrune,
  NormalizedPackagePrune,
  normalizePackagePrune,
  prunePackageJson,
} from './package-prune.js'
import {
  findUnrepairedPatchKeys,
  isRemovablePatchPath,
  PatchConfigFile,
  PatchConfigKind,
  PatchFilterPlan,
  planPatchFilter,
} from './patched-dependencies.js'
import { PackageManager } from './package-files/package-manager.js'
import { File } from './parser.js'
import { Registries, REGISTRIES_ARCHIVE_PATH, serializeRegistries, validateRegistries } from '../runner/registries.js'
import { Workspace } from './package-files/workspace.js'
import { pathToPosix } from '../util.js'

const debug = Debug('checkly:cli:services:check-parser:bundler')

/**
 * The files pnpm accepts `patchedDependencies` in, which are also their
 * archive paths: both live at the workspace root, and the workspace root is
 * the bundle's strip prefix (see {@link Bundler.createForWorkspace}).
 */
const PATCH_CONFIG_KINDS: PatchConfigKind[] = ['pnpm-workspace.yaml', 'package.json']

/**
 * Where a file goes in the archive. A file usually lands at its own path
 * relative to the bundle root, but a file bundled at the path of a symlink that
 * points at it carries the archive path explicitly.
 */
function archivePath (file: File, stripPrefix?: string): string {
  if (file.physical && file.archivePath !== undefined) {
    return file.archivePath
  }

  // Posix form, because this value keys the bundler's dedup registry alongside
  // resolver-carried archive paths, which are always posix. On Windows,
  // path.relative produces a backslash spelling that would not collide with the
  // posix spelling of the same path, and the archive would end up with
  // duplicate entries (archiver normalizes both to the same tar name).
  return pathToPosix(stripPrefix
    ? path.relative(stripPrefix, file.filePath)
    : file.filePath)
}

/**
 * Drops any symlink that has entries beneath it. One path cannot be both a
 * symlink and a directory, and tar refuses to extract an archive claiming
 * otherwise — the failure this whole mechanism exists to avoid.
 *
 * This has to happen here, over the complete set of entries, and not only where
 * the entries are produced: the archive is the union of what the symlink
 * resolver contributed and what the check parser registered, and the parser does
 * not resolve symlinks. A spec that imports through a symlinked directory is
 * registered at its path *through* that link, which puts it under a link the
 * resolver quite reasonably kept.
 *
 * Entry names are posix by construction — archivePath() guarantees it.
 *
 * The link is what goes, rather than the files: the files are content, and they
 * extract perfectly well as ordinary files, whereas the link takes the whole
 * archive down with it.
 */
function dropSymlinksWithChildren (entries: Array<[string, File]>): File[] {
  const directories = new Set<string>()

  for (const [name] of entries) {
    for (
      let parent = path.posix.dirname(name);
      parent !== '.' && parent !== '/' && parent !== '' && !directories.has(parent);
      parent = path.posix.dirname(parent)
    ) {
      directories.add(parent)
    }
  }

  return entries
    .filter(([name, file]) => {
      if (!file.physical || file.symlinkTarget === undefined) {
        return true
      }

      if (!directories.has(name)) {
        return true
      }

      if (file.referencedLink) {
        // Path references in a bundled file (e.g. a Playwright config's
        // testDir) depend on this link, and they will not resolve without it.
        // The situation is a conflict between those references and files
        // archived beneath the link's own path — say so, rather than letting
        // the check fail only in the cloud.
        process.stderr.write(
          `Warning: ${name} is a symlink that bundled configuration refers to, but other files `
          + `are archived beneath its path, so the symlink itself cannot be included. References `
          + `through it may not resolve when the check runs.\n`,
        )
      }

      debug(`Dropping symlink ${name}: other files are archived beneath it`)

      return false
    })
    .map(([, file]) => file)
}

export interface CreateBundleArchiveOptions {
  tempDir?: string
  stripPrefix?: string
}

interface BundleArchiveOptions {
  stripPrefix?: string
  tempDir: string
  archive: Archiver
  archiveFile: string
  archiveFileWriteStream: WriteStream
}

export class BundleArchive {
  static TMPDIR_PREFIX = 'cli-'
  static DEFAULT_FILENAME = 'playwright-project.tar.gz'

  #tempDir: string
  #archiveFile: string
  #archiveFileWriteStream: WriteStream
  #stripPrefix?: string
  #archive: Archiver
  #containsEmbeddedPackages = false

  private constructor (options: BundleArchiveOptions) {
    const {
      tempDir,
      archiveFile,
      archiveFileWriteStream,
      stripPrefix,
      archive,
    } = options

    this.#tempDir = tempDir
    this.#archiveFile = archiveFile
    this.#archiveFileWriteStream = archiveFileWriteStream
    this.#stripPrefix = stripPrefix
    this.#archive = archive
  }

  static async create (options: CreateBundleArchiveOptions): Promise<BundleArchive> {
    debug(`Creating bundle archive`)

    const {
      tempDir: maybeTempDir,
      stripPrefix,
    } = options

    const tempDir = maybeTempDir
      ? await fs.mkdir(maybeTempDir, { recursive: true }).then(() => maybeTempDir)
      // tmpdir() on macOS usually returns a path starting with /var which is
      // a symlink. Resolve the path so that we don't run into path mismatch
      // issues.
      : await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), BundleArchive.TMPDIR_PREFIX)))

    debug(`Using temporary directory ${tempDir}`)

    const archiveFile = path.join(tempDir, BundleArchive.DEFAULT_FILENAME)

    debug(`Using archive file ${archiveFile}`)

    const archive = await createArchiver()
    const output = createWriteStream(archiveFile)
    archive.pipe(output)

    return new BundleArchive({
      tempDir,
      archiveFile,
      archive,
      archiveFileWriteStream: output,
      stripPrefix,
    })
  }

  async add (...files: File[]): Promise<void> {
    // Stat every physical file up front, following symlinks, and hand the result
    // to archiver. Left to itself archiver lstats each path and turns anything
    // that happens to be a symlink into a symlink entry — which is how a symlink
    // and the files beneath it end up in the archive at the same path, an
    // archive tar cannot extract. Symlink entries are emitted deliberately,
    // below, and nowhere else.
    //
    // A bundle that includes node_modules runs to tens of thousands of files, so
    // these go out together rather than one await at a time.
    const stats = await Promise.all(files.map(async file => {
      if (!file.physical || file.symlinkTarget !== undefined) {
        return undefined
      }

      try {
        return await fs.stat(file.filePath)
      } catch (err) {
        // Following the link means a broken one fails here, where archiver would
        // previously have made it a dangling entry.
        process.stderr.write(`Warning: skipping ${file.filePath}: ${err instanceof Error ? err.message : err}\n`)
        return undefined
      }
    }))

    for (const [index, file] of files.entries()) {
      const name = archivePath(file, this.#stripPrefix)

      if (name.startsWith(`${EMBEDDED_PACKAGES_ARCHIVE_DIR}/`)) {
        this.#containsEmbeddedPackages = true
      }

      const entry = {
        mode: 0o755, // Default mode for files in the archive
        name,
      }

      if (!file.physical) {
        this.#archive.append(file.content, entry)
        continue
      }

      if (file.symlinkTarget !== undefined) {
        this.#archive.symlink(name, file.symlinkTarget, entry.mode)
        continue
      }

      const fileStats = stats[index]
      if (fileStats === undefined) {
        continue
      }

      this.#archive.file(file.filePath, { ...entry, stats: fileStats })
    }
  }

  async finalize (): Promise<FinalizedBundleArchive> {
    await this.#archive.finalize()

    await new Promise<void>((resolve, reject) => {
      this.#archiveFileWriteStream.on('close', resolve)
      this.#archiveFileWriteStream.on('error', reject)
    })

    return await FinalizedBundleArchive.create({
      archiveFile: this.#archiveFile,
      containsEmbeddedPackages: this.#containsEmbeddedPackages,
    })
  }

  async destroy (): Promise<void> {
    debug(`Destroying root ${this.#tempDir}`)

    await fs.rm(this.#tempDir, {
      recursive: true,
      force: true,
    })
  }
}

export interface BundleTooLargeErrorOptions {
  sizeBytes: number
  maxBytes?: number
  containsEmbeddedPackages?: boolean
  cause?: unknown
}

/**
 * Error thrown when the Checkly API rejects the code bundle upload because
 * the bundle exceeds the maximum size the API accepts (HTTP 413). The size
 * limit is enforced server-side and is not known ahead of time; it is parsed
 * from the response when the server names it.
 */
export class BundleTooLargeError extends Error {
  readonly sizeBytes: number
  readonly maxBytes?: number
  readonly containsEmbeddedPackages: boolean

  constructor (options: BundleTooLargeErrorOptions) {
    const {
      sizeBytes,
      maxBytes,
      containsEmbeddedPackages,
      cause,
    } = options

    // Round the bundle size up and the limit down so that a bundle just
    // barely over the limit cannot render as two equal figures ("the
    // compressed bundle is 30 MB, but the Checkly API accepts at most
    // 30 MB").
    const size = formatMegabytes(sizeBytes, Math.ceil)

    // Attribute the limit to the Checkly API only when a plausible one is
    // known (given, and not so small that it floors to "0 MB"). A 413 can
    // also come from an intermediary (e.g. a corporate proxy with its own
    // upload cap), but such a response would not use the API's own message
    // phrasing that maxBytes is parsed from, and ends up here undefined.
    const formattedLimit = maxBytes !== undefined ? formatMegabytes(maxBytes, Math.floor) : undefined
    const limit = formattedLimit !== undefined && formattedLimit !== '0 MB'
      ? `but the Checkly API accepts at most ${formattedLimit}`
      : `which exceeds what the upload endpoint accepts`

    const remedies = containsEmbeddedPackages
      ? `removing large files from the Playwright project, narrowing any 'include' patterns, `
      + `or embedding fewer private packages ('bundle.packages.embed')`
      : `removing large files from the Playwright project or narrowing any 'include' patterns`

    super(
      `The code bundle is too large to upload: the compressed bundle is ${size}, ${limit}. `
      + `Reduce the bundle size by ${remedies}.`,
      { cause },
    )
    this.name = 'BundleTooLargeError'
    this.sizeBytes = sizeBytes
    this.maxBytes = maxBytes
    this.containsEmbeddedPackages = containsEmbeddedPackages ?? false
  }
}

function formatMegabytes (bytes: number, round: (value: number) => number): string {
  return `${round(bytes / 1048576 * 10) / 10} MB`
}

/**
 * A 413 response names the size limit only inside hapi's message text
 * ("Payload content length greater than maximum allowed: <bytes>"); there is
 * no structured field carrying it.
 */
function parseMaxBytes (message: string): number | undefined {
  const match = /maximum allowed: (\d+)/.exec(message)
  return match !== null ? Number(match[1]) : undefined
}

export interface CreateFinalizedBundleArchiveOptions {
  archiveFile: string
  containsEmbeddedPackages?: boolean
}

interface FinalizedBundleArchiveOptions {
  archiveFile: string
  containsEmbeddedPackages?: boolean
}

export class FinalizedBundleArchive {
  #archiveFile: string
  #containsEmbeddedPackages: boolean

  private constructor (options: FinalizedBundleArchiveOptions) {
    const {
      archiveFile,
      containsEmbeddedPackages,
    } = options

    this.#archiveFile = archiveFile
    this.#containsEmbeddedPackages = containsEmbeddedPackages ?? false
  }

  // eslint-disable-next-line require-await
  static async create (options: CreateFinalizedBundleArchiveOptions): Promise<FinalizedBundleArchive> {
    return new FinalizedBundleArchive(options)
  }

  get archiveFile (): string {
    return this.#archiveFile
  }

  async store (): Promise<RemoteBundleArchive> {
    const { size } = await fs.stat(this.#archiveFile)

    try {
      const {
        data: {
          key,
        },
      } = await this.#uploadCodeBundle(this.#archiveFile, size)

      return await RemoteBundleArchive.create({
        key,
      })
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        throw new BundleTooLargeError({
          sizeBytes: size,
          maxBytes: parseMaxBytes(err.data.message),
          containsEmbeddedPackages: this.#containsEmbeddedPackages,
          cause: err,
        })
      }

      throw err
    }
  }

  async #uploadCodeBundle (filePath: string, size: number): Promise<AxiosResponse> {
    const stream = createReadStream(filePath)
    stream.on('error', err => {
      throw new Error(`Failed to read Playwright project file: ${err.message}`)
    })
    try {
      return await checklyStorage.uploadCodeBundle(stream, size)
    } finally {
      // A failed upload leaves the stream unconsumed and its file handle
      // open; on Windows the open handle blocks deleting the archive's
      // temp directory. destroy() only schedules the close, so wait for it
      // to complete before continuing to any cleanup. (After a fully
      // consumed upload the stream has already auto-closed and both calls
      // are no-ops.)
      stream.destroy()
      if (!stream.closed) {
        await once(stream, 'close')
      }
    }
  }
}

export interface CreateRemoteBundleArchiveOptions {
  key: string
}

interface RemoteBundleArchiveOptions {
  key: string
}

export class RemoteBundleArchive {
  #key: string

  private constructor (options: RemoteBundleArchiveOptions) {
    const {
      key,
    } = options

    this.#key = key
  }

  // eslint-disable-next-line require-await
  static async create (options: CreateRemoteBundleArchiveOptions): Promise<RemoteBundleArchive> {
    return new RemoteBundleArchive(options)
  }

  get key (): string {
    return this.#key
  }
}

export interface CreateBundlerOptions {
  tempDir?: string
  cacheHash: string
  stripPrefix?: string
}

export type CreateBundlerForWorkspaceOptions =
  Omit<CreateBundlerOptions, 'cacheHash' | 'stripPrefix'>
  & Omit<ComputeWorkspaceCacheHashOptions, 'embeddedPackages'>
  & {
    /**
     * The project's `runner.registries` option, when set. Serialized into
     * the bundle as `.checkly/registries.json` during finalize() so
     * Checkly runners route the bundle's package installs through the
     * configured upstreams, and mixed into the cache hash: repointing a
     * registry changes the runner's install inputs without necessarily
     * touching the lockfile.
     */
    runnerRegistries?: Registries
    /**
     * The materializer for the project's `bundle.packages.embed` option,
     * when set. The tarballs are materialized during finalize(), after the
     * bundled lockfile has been pruned, so only tarballs the shipped
     * lockfile still references are downloaded and shipped. That same
     * filtered set (name, version, integrity) is mixed into the cache hash:
     * embedded tarballs change the runner's install-step inputs without
     * necessarily touching the lockfile, so a changed embed set must
     * invalidate the dependency cache.
     */
    embeddedPackagesMaterializer?: EmbeddedPackagesMaterializer

    /**
     * The workspace's package manager. When it supports a lockfile-only
     * install, the bundled lockfile is pruned during finalize() to match the
     * bundle's actual set of manifests.
     */
    packageManager: PackageManager

    /**
     * The project's `bundle.packages.prune` option, when set. Matching
     * entries are removed from the workspace manifests shipped in the
     * bundle during finalize(), before lockfile pruning, so the removed
     * dependencies fall out of the pruned lockfile too. The rewritten
     * manifests are mixed into the cache hash the same way patch-rewritten
     * manifests are. Because the rewritten manifests only make sense next
     * to a matching lockfile, the rewrite is rolled back when a bundled
     * lockfile cannot be pruned in the same run.
     */
    packagePrune?: BundlePackagesPrune
  }

interface PrunedLockfile extends LockfileInput {
  /**
   * The pruned lockfile bytes, needed to decide which embedded package
   * tarballs the shipped lockfile still references. Inert for the cache
   * hash, which only consumes the name and hash.
   */
  content: string
  /** Where the lockfile lives in the archive. */
  archivePath: string
  /**
   * The lockfile as it was before pruning, carried through for the patch
   * filtering (see {@link Bundler.dropUnusedPatches}).
   */
  originalContent: string
}

/**
 * Bundle-time cache-hash inputs. `embeddedPackages` is a required key
 * (though its value may be undefined) so that no hash computation can
 * silently omit the shipped embedded set — an omission would not change
 * the bundle's bytes, only desync the runner's dependency cache key.
 */
type BundleTimeCacheHashInputs =
  Pick<ComposeWorkspaceCacheHashOptions, 'fauxPackageJsons' | 'prunedLockfile'>
  & { embeddedPackages: ComposeWorkspaceCacheHashOptions['embeddedPackages'] }

/**
 * Maps planned tarballs to cache-hash records. yarn.lock plans carry no SRI
 * tarball integrity (it is resolved from registry metadata only at
 * materialization time), so their records use the lockfile's own checksum —
 * an equally stable content pin that is known at plan time, keeping the
 * eager placeholder hash and the finalize hash consistent. The parsers
 * guarantee one of the two hashes is always present; the empty-string
 * fallback only satisfies the type.
 */
export function embeddedPackageHashInputs (tarballs: PlannedTarball[] | undefined): EmbeddedPackageInput[] | undefined {
  return tarballs?.map(({ name, version, integrity, lockfileChecksum }) => ({
    name,
    version,
    integrity: integrity ?? lockfileChecksum ?? '',
  }))
}

/**
 * Everything finalize() needs to prune the lockfile and recompute the cache
 * hash from the bundle's actual contents.
 */
interface WorkspaceBundleContext {
  workspace: Workspace
  packageManager: PackageManager
  /**
   * The embedded-packages materializer, carried to finalize() so the
   * tarballs the (possibly pruned) bundled lockfile still references can be
   * materialized there — after pruning, so pruned-away tarballs are never
   * downloaded. The planned set is re-derived from the materializer's
   * memoized plan().
   */
  embeddedPackagesMaterializer?: EmbeddedPackagesMaterializer
  /**
   * The normalized `bundle.packages.prune` option, applied to the bundled
   * workspace manifests at the start of finalize().
   */
  packagePrune?: NormalizedPackagePrune
  /**
   * The serialized `runner.registries` configuration, registered into the
   * bundle as `.checkly/registries.json` during finalize(). Serialized
   * once at construction so the eager cache hash and the finalize()
   * recompute digest the same bytes.
   */
  runnerRegistriesContent?: string
  /**
   * Composes the cache hash from the workspace inputs captured at
   * construction time, plus the given bundle-time inputs — including the
   * embedded set actually shipped, which every caller passes explicitly.
   * Capturing the composition (rather than its ingredients) keeps
   * createForWorkspace and finalize() from having to spell the same
   * argument list twice.
   */
  composeCacheHash: (extra: BundleTimeCacheHashInputs) => string
}

interface BundlerOptions {
  tempDir?: string
  cacheHash: string
  stripPrefix?: string
  workspaceContext?: WorkspaceBundleContext
}

export class Bundler {
  #id: string
  #marker: BundlePathMarker
  #cacheHashMarker: CacheHashMarker
  #tempDir?: string
  #stripPrefix?: string
  #workspaceContext?: WorkspaceBundleContext
  #files = new Map<string, File>()
  /**
   * Archive paths of manifests a finalize-time rewrite replaced — package
   * pruning (`bundle.packages.prune`) or the patch filtering. Unlike a
   * synthesized member manifest, a rewritten manifest has an on-disk original,
   * so it is hashed the way on-disk manifests are — with `version` stripped —
   * rather than verbatim. Hashing the raw bytes would make a release bump
   * alone change the dependency cache key even though no install input did.
   */
  #rewrittenManifests = new Set<string>()

  private constructor (options: BundlerOptions) {
    const {
      tempDir,
      cacheHash,
      stripPrefix,
      workspaceContext,
    } = options

    this.#id = uuid.v4()
    this.#marker = new BundlePathMarker(`bundle:${this.#id}`)
    this.#cacheHashMarker = new CacheHashMarker(cacheHash)
    this.#stripPrefix = stripPrefix
    this.#tempDir = tempDir
    this.#workspaceContext = workspaceContext
  }

  /**
   * Creates a bundler without a workspace context. Workspace-dependent
   * finalize() behavior — lockfile pruning, embedded package
   * materialization (`bundle.packages.embed`) and the cache-hash recompute
   * — only happens for bundlers built with {@link createForWorkspace}; a
   * plain bundler archives exactly the files registered into it.
   */
  // eslint-disable-next-line require-await
  static async create (options: CreateBundlerOptions): Promise<Bundler> {
    debug(`Creating bundler`)
    return new Bundler(options)
  }

  static async createForWorkspace (
    workspace: Workspace,
    options: CreateBundlerForWorkspaceOptions,
  ): Promise<Bundler> {
    debug(`Creating bundler for workspace`)

    const {
      tempDir,
      dependencyCacheVersion,
      embeddedPackagesMaterializer,
      packageManager,
      packagePrune,
      runnerRegistries,
    } = options

    const embeddedPackages = (await embeddedPackagesMaterializer?.plan())?.tarballs

    // Serialized once so the eager cache hash below, the finalize()
    // recompute and the registered bundle file all agree on the exact
    // bytes. Re-validated on entry like `normalizePackagePrune` is — the
    // config loader has already validated config-sourced values, but
    // programmatic callers reach this constructor directly.
    const runnerRegistriesContent = runnerRegistries !== undefined
      ? serializeRegistries(validateRegistries(runnerRegistries))
      : undefined
    const runnerRegistriesDigest = runnerRegistriesContent !== undefined
      ? createHash('sha256').update(runnerRegistriesContent, 'utf8').digest()
      : undefined

    // The composition is captured so finalize() can recompute the hash with
    // bundle-time additions (faux manifests, a pruned lockfile) from the
    // same workspace inputs, loaded once. The eager value below is only a
    // placeholder for the window before finalize() runs — finalize() always
    // recomputes it.
    const cacheHashInputs = await loadWorkspaceCacheHashInputs(workspace)
    const composeCacheHash = (extra: BundleTimeCacheHashInputs): string => {
      return composeWorkspaceCacheHash(cacheHashInputs, {
        dependencyCacheVersion,
        runnerRegistries: runnerRegistriesDigest,
        ...extra,
      })
    }

    return new Bundler({
      tempDir,
      cacheHash: composeCacheHash({ embeddedPackages: embeddedPackageHashInputs(embeddedPackages) }),
      stripPrefix: workspace?.root.path,
      workspaceContext: {
        workspace,
        packageManager,
        embeddedPackagesMaterializer,
        packagePrune: normalizePackagePrune(packagePrune),
        runnerRegistriesContent,
        composeCacheHash,
      },
    })
  }

  get marker (): BundlePathMarker {
    return this.#marker
  }

  updateMarker (newValue: string): void {
    this.#marker.updateValue(newValue)
  }

  /**
   * The dependency cache hash. A mutable holder rather than a plain string:
   * consumers copy it into check payloads during bundle(), but the final
   * value — reflecting faux manifests and a possibly pruned lockfile — is
   * only known once finalize() has run, the same ordering problem
   * {@link BundlePathMarker} solves for the archive path.
   */
  get cacheHash (): CacheHashMarker {
    return this.#cacheHashMarker
  }

  /**
   * Whether any files have been registered for bundling. Only Playwright check
   * suites register files (see playwright-check.ts), so an empty bundler means the
   * project has nothing that needs a remote code bundle and the upload can be skipped.
   */
  get isEmpty (): boolean {
    return this.#files.size === 0
  }

  registerFiles (...files: File[]): void {
    for (const newFile of files) {
      // Keyed by archive path, not source path: one source file can be archived
      // at more than one path (a package reached through two symlinks), and
      // keying by source would silently drop all but one of them.
      const key = archivePath(newFile, this.#stripPrefix)

      const existingFile = this.#files.get(key)
      if (existingFile) {
        // Prefer physical files.
        if (existingFile.physical && !newFile.physical) {
          continue
        }
      }

      this.#files.set(key, newFile)
    }
  }

  /**
   * Prunes the bundled lockfile to match the bundle's final file set,
   * materializes the embedded package tarballs the (possibly pruned)
   * lockfile still references, and recomputes the cache hash from the
   * bundle's actual install inputs (faux manifests, the pruned lockfile and
   * the shipped embedded set). Runs at finalize time because all of it
   * depends on the complete file set, which only exists once every check
   * has registered its files — and because materializing after pruning is
   * what keeps pruned-away tarballs from ever being downloaded.
   */
  async #refreshWorkspaceBundle (): Promise<void> {
    const context = this.#workspaceContext
    if (context === undefined) {
      return
    }

    const prunedManifestOriginals = await this.#pruneManifestPackages(context)

    const lockfilePrune = await this.#pruneLockfile(context)
    const pruned = await this.#dropUnusedPatches(context, lockfilePrune.pruned)

    // Pruned manifests must never ship alongside an unpruned lockfile: the
    // lockfile's importer sections would declare dependencies the shipped
    // manifests lack, failing the runner's frozen install. When lockfile
    // pruning skipped or failed for any reason, roll the manifest rewrite
    // back — unless the skip itself proved the original lockfile already
    // matches the pruned manifests (a byte-identical regeneration), or the
    // bundle ships no lockfile at all, in which case the manifests are the
    // install's only input and nothing can fall out of sync.
    if (
      pruned === undefined
      && !lockfilePrune.consistent
      && prunedManifestOriginals.size > 0
      && this.#bundledLockfilePath(context) !== undefined
    ) {
      for (const [manifestPath, original] of prunedManifestOriginals) {
        this.#files.set(manifestPath, original)
        this.#rewrittenManifests.delete(manifestPath)
      }
      process.stderr.write(
        `Warning: bundle.packages.prune was not applied because the bundled lockfile could `
        + `not be pruned to match; the original manifests ship unchanged.\n`,
      )
    }
    const embeddedPackages = await this.#materializeEmbeddedPackages(context, pruned)

    this.#registerRunnerRegistries(context)

    const fauxPackageJsons: FauxPackageJsonInput[] = []
    for (const [archivePath, file] of this.#files) {
      if (file.physical || path.posix.basename(archivePath) !== 'package.json') {
        continue
      }
      const raw = Buffer.from(file.content, 'utf8')
      fauxPackageJsons.push({
        path: archivePath,
        raw: this.#rewrittenManifests.has(archivePath)
          ? canonicalizePackageJson(raw, PACKAGE_JSON_EXCLUDED_FIELDS)
          : raw,
      })
    }

    // Unconditional: with no faux manifests, no pruned lockfile and an
    // unfiltered embedded set this reproduces the exact digest computed in
    // createForWorkspace (empty record groups write nothing).
    this.#cacheHashMarker.updateValue(context.composeCacheHash({
      fauxPackageJsons,
      prunedLockfile: pruned,
      embeddedPackages: embeddedPackageHashInputs(embeddedPackages),
    }))
  }

  /**
   * Registers the serialized `runner.registries` configuration into the
   * bundle at {@link REGISTRIES_ARCHIVE_PATH}. The path is CLI-managed:
   * runners honor whatever lands there, so a pre-existing entry — a
   * hand-written file an `include` glob dragged in, which has passed no
   * validation and contributes nothing to the cache hash — is dropped
   * rather than shipped, whether or not the option is set. Set directly
   * rather than through `registerFiles`, whose prefer-physical rule
   * would keep such a file. Skipped when the bundle is empty: the
   * project then has no Playwright Check Suite, nothing is uploaded, and
   * registering the file would make `isEmpty` misreport.
   */
  #registerRunnerRegistries (context: WorkspaceBundleContext): void {
    if (this.#files.delete(REGISTRIES_ARCHIVE_PATH)) {
      process.stderr.write(
        `Warning: ${REGISTRIES_ARCHIVE_PATH} is generated from the 'runner.registries' config `
        + `field and cannot be supplied as a project file; the included file was dropped.\n`,
      )
    }

    const content = context.runnerRegistriesContent
    if (content === undefined || this.isEmpty) {
      return
    }

    this.#files.set(REGISTRIES_ARCHIVE_PATH, {
      // A virtual file's archive path is derived from its filePath
      // relative to the strip prefix, so the filePath must sit under it.
      filePath: path.join(this.#stripPrefix ?? '', REGISTRIES_ARCHIVE_PATH),
      physical: false,
      content,
    })
  }

  /**
   * Applies `bundle.packages.prune` to the workspace manifests in the
   * bundle — the root's and every bundled member's — replacing each
   * affected entry with a rewritten virtual copy. Runs before lockfile
   * pruning so the lockfile-only install resolves against the reduced
   * manifests and the removed dependencies fall out of the pruned lockfile.
   * Only manifests at the workspace's own locations are touched: a
   * package.json an `include` glob dragged in is not an install input.
   *
   * Returns the replaced original entries, keyed by archive path, so
   * {@link Bundler.refreshWorkspaceBundle} can roll the rewrite back when
   * the bundled lockfile cannot be pruned to match.
   */
  async #pruneManifestPackages (context: WorkspaceBundleContext): Promise<Map<string, File>> {
    const replaced = new Map<string, File>()

    const prune = context.packagePrune
    if (prune === undefined) {
      return replaced
    }

    const { workspace } = context
    for (const pkg of [workspace.root, ...workspace.packages]) {
      const manifestPath = manifestArchivePath(workspace, pkg)
      const file = this.#files.get(manifestPath)
      if (file === undefined) {
        continue
      }
      if (!file.physical) {
        // The only virtual member manifests are synthesized ones (faux
        // shims), which carry no dependency classes — and only a rewrite
        // of a physical original may join #rewrittenManifests, whose
        // consumers rely on the rewritten content being the real manifest.
        debug(`Not pruning ${manifestPath}: not a physical manifest`)
        continue
      }
      if (file.symlinkTarget !== undefined) {
        this.#warnManifestPruneFailure(manifestPath, `the manifest is bundled as a symlink`)
        continue
      }
      // A virtual entry's archive name is always derived from its filePath,
      // so a replacement can only stand in for an entry that already
      // archives at that derived path (same rule as #readPatchConfigs).
      const replacementArchivePath = pathToPosix(
        path.relative(this.#stripPrefix ?? '', file.filePath),
      )
      if (replacementArchivePath !== manifestPath) {
        this.#warnManifestPruneFailure(
          manifestPath,
          `the rewritten manifest would move to ${replacementArchivePath}`,
        )
        continue
      }

      let content: string
      try {
        content = await fs.readFile(file.filePath, 'utf8')
      } catch (err) {
        this.#warnManifestPruneFailure(manifestPath, `the bundled manifest could not be read (${err})`)
        continue
      }

      const result = prunePackageJson(content, prune)
      if (result === undefined) {
        this.#warnManifestPruneFailure(manifestPath, `the manifest could not be rewritten safely`)
        continue
      }
      if (!result.changed) {
        // Left physical: the entry hashes and ships exactly as before, and
        // an untouched manifest must not force lockfile pruning.
        continue
      }

      replaced.set(manifestPath, file)
      this.#files.set(manifestPath, {
        // The archive name is derived from filePath, so the rewritten entry
        // has to keep the original's.
        filePath: file.filePath,
        physical: false,
        content: result.content,
      })
      this.#rewrittenManifests.add(manifestPath)
      debug(`Pruned ${manifestPath}: ${result.removed.join(', ') || '(structural cleanup only)'}`)
    }

    return replaced
  }

  #warnManifestPruneFailure (manifestPath: string, reason: string): void {
    // A stderr warning rather than a debug line: pruning is a user-requested
    // transformation, and silently shipping the original manifest
    // reintroduces the exact lockfile bloat the user configured it to
    // remove.
    process.stderr.write(
      `Warning: could not apply bundle.packages.prune to ${manifestPath}: ${reason}; `
      + `its original contents ship unchanged.\n`,
    )
  }

  /**
   * The archive path of the workspace's lockfile when the bundle ships it,
   * mirroring the checks lockfile pruning performs before running.
   */
  #bundledLockfilePath (context: WorkspaceBundleContext): string | undefined {
    const archivePath = lockfileArchivePath(context.workspace)
    if (archivePath === undefined || !this.#files.has(archivePath)) {
      return undefined
    }
    return archivePath
  }

  /**
   * Materializes the embedded package tarballs into the bundle: the full
   * planned set, or — when the bundled lockfile was pruned — only the
   * tarballs the pruned lockfile still references, so pruned-away packages
   * are never downloaded. Returns the shipped set for the cache hash.
   */
  async #materializeEmbeddedPackages (
    context: WorkspaceBundleContext,
    pruned: PrunedLockfile | undefined,
  ): Promise<PlannedTarball[] | undefined> {
    const materializer = context.embeddedPackagesMaterializer
    if (materializer === undefined) {
      return undefined
    }

    // plan() is memoized and was already awaited in createForWorkspace, so
    // this resolves the same promise without extra work.
    const { tarballs: embeddedPackages } = await materializer.plan()

    // The empty-bundle arm is load-bearing: every command calls finalize()
    // unconditionally, including on bundles no check registered files into,
    // and an empty bundle must not trigger downloads (nor the materializer's
    // plan-issues backstop, which validation never ran for a project
    // without Playwright checks). Nothing ships from an empty bundle, so
    // nothing reaches the hash either.
    if (this.isEmpty) {
      return undefined
    }

    let kept = embeddedPackages
    if (pruned !== undefined) {
      const filtered = filterTarballsByLockfile(embeddedPackages, pruned.content, pruned.name)
      kept = filtered.kept
      if (filtered.dropped.length > 0) {
        debug(`Embedded packages dropped with the pruned lockfile: ${
          filtered.dropped.map(tarball => `${tarball.name}@${tarball.version}`).join(', ')}`)
      }
    }

    // Debug rather than user-facing output for now: a bare stderr line has
    // no good home in the current CLI output UX. Revisit when finalize-time
    // work gets proper progress reporting.
    if (kept.length > 0) {
      debug(`Preparing ${kept.length} embedded package tarball(s)`)
    }

    // Deliberately called even for an empty kept set: the materializer's
    // plan-issues backstop must still reject a plan whose specs all failed
    // to resolve.
    const materialized = await materializer.materializeTarballs(kept)
    this.registerFiles(...materialized.map(tarball => ({
      filePath: tarball.filePath,
      physical: true as const,
      archivePath: tarball.archivePath,
    })))

    return kept
  }

  /**
   * Filters the bundle's pnpm patch declarations down to the ones the pruned
   * lockfile shows still apply, dropping the matching patch files and lockfile
   * entries with them.
   *
   * A bundle carries the workspace's whole `patchedDependencies` map but only
   * a subset of its members, so a patch whose package belongs to an unbundled
   * member ends up applying to nothing. pnpm rejects that outright when it
   * re-resolves, which is why the prune install tolerates it (see
   * PNpmDetector.lockfileOnlyInstallCommand) and the leftovers are cleaned up
   * here instead — the pruned lockfile is the first point at which the bundle's
   * real dependency graph is known.
   *
   * Every failure mode leaves the bundle exactly as pruning produced it, which
   * installs correctly today; the reporting below covers the case where that
   * fallback is nonetheless a bundle the runner would reject.
   */
  async #dropUnusedPatches (
    context: WorkspaceBundleContext,
    pruned: PrunedLockfile | undefined,
  ): Promise<PrunedLockfile | undefined> {
    if (pruned === undefined || context.packageManager.name !== 'pnpm') {
      return pruned
    }

    let configs: PatchConfigFile[] = []
    let result = pruned
    try {
      // `replaceable` is about whether the filtering may edit these files;
      // whatever could be READ still feeds the diagnostic below, so a bundle
      // this step declines to touch is not also a bundle it stays quiet about.
      const read = await this.#readPatchConfigs()
      configs = read.configs
      if (read.replaceable) {
        const plan = planPatchFilter({
          configs,
          originalLockfileContent: pruned.originalContent,
          prunedLockfileContent: pruned.content,
        })
        if (plan !== undefined) {
          const applied = this.#applyPatchFilter(context, pruned, plan)
          if (applied !== undefined) {
            result = applied
            // The diagnostic below must see what actually ships, so the config
            // is swapped for its rewritten bytes only once the apply took.
            configs = configs.map(config => config.archivePath === plan.rewrittenConfig.archivePath
              ? { ...config, content: plan.rewrittenConfig.content }
              : config)
            debug(`Dropped unused patch declarations: ${plan.unusedKeys.join(', ')}`)
          }
        }
      }
    } catch (err) {
      debug(`Could not filter the bundle's patch declarations: ${err}`)
    }

    // Evaluated on every path, including the ones that changed nothing: a
    // config declaring a patch the shipped lockfile does not record is what
    // makes the runner's install fail, and silently shipping that is the
    // failure this step exists to prevent.
    if (configs.length > 0) {
      const unrepaired = findUnrepairedPatchKeys({
        configs,
        originalLockfileContent: pruned.originalContent,
        shippedLockfileContent: result.content,
      })
      if (unrepaired.length > 0) {
        process.stderr.write(
          `Note: the bundled pnpm config declares patches that the bundled lockfile does not `
          + `record (${unrepaired.join(', ')}), which can fail the remote install. Your own lockfile `
          + `does record them, so run your package manager's install to refresh it rather than `
          + `removing the entries; set CHECKLY_LOCKFILE_PRUNE=0 to opt out of pruning entirely.\n`,
        )
      }
    }

    return result
  }

  /**
   * Reads the bundle's copies of the two files pnpm accepts
   * `patchedDependencies` in.
   *
   * `replaceable` is false when a candidate exists but cannot be read or
   * cannot be swapped for a rewritten copy; filtering one declaring config
   * while leaving the other would manufacture the very config/lockfile
   * mismatch this step removes. Whatever *could* be read is still returned, so
   * the caller can report on a bundle it declines to edit.
   */
  async #readPatchConfigs (): Promise<{ configs: PatchConfigFile[], replaceable: boolean }> {
    const configs: PatchConfigFile[] = []
    let replaceable = true

    // The archive path and the kind are the same string here; see
    // PATCH_CONFIG_KINDS for why.
    for (const archivePath of PATCH_CONFIG_KINDS) {
      const file = this.#files.get(archivePath)
      if (file === undefined) {
        continue
      }

      // A virtual entry's archive name is always derived from its filePath,
      // so a replacement can only stand in for an entry that already archives
      // at that derived path. An entry bundled somewhere other than its own
      // path — reached through a symlink, and carrying an explicit
      // archivePath — cannot be replaced without moving it.
      const replacementArchivePath = pathToPosix(
        path.relative(this.#stripPrefix ?? '', file.filePath),
      )
      if (replacementArchivePath !== archivePath) {
        debug(`Bundled ${archivePath} would move to ${replacementArchivePath} if rewritten;`
          + ` leaving patches alone`)
        replaceable = false
      }

      try {
        const content = file.physical
          ? await fs.readFile(file.filePath, 'utf8')
          : file.content
        configs.push({ archivePath, kind: archivePath, content })
      } catch (err) {
        debug(`Could not read bundled ${archivePath}: ${err}`)
        replaceable = false
      }
    }

    return { configs, replaceable }
  }

  /**
   * Applies a patch filter plan. Deliberately pure map mutation over
   * already-computed content: a throw partway through would ship a bundle
   * whose config, patch files and lockfile disagree, which fails the runner's
   * install either way it lands.
   */
  #applyPatchFilter (
    context: WorkspaceBundleContext,
    pruned: PrunedLockfile,
    plan: PatchFilterPlan,
  ): PrunedLockfile | undefined {
    // Resolved before anything is mutated: the config entry is what the plan
    // was computed from, and rewriting the lockfile without it would ship the
    // mismatch this step exists to remove.
    const existing = this.#files.get(plan.rewrittenConfig.archivePath)
    if (existing === undefined) {
      return undefined
    }

    this.#files.set(plan.rewrittenConfig.archivePath, {
      // The archive name is derived from filePath, so the rewritten entry has
      // to keep the original's.
      filePath: existing.filePath,
      physical: false,
      content: plan.rewrittenConfig.content,
    })
    if (path.posix.basename(plan.rewrittenConfig.archivePath) === 'package.json') {
      this.#rewrittenManifests.add(plan.rewrittenConfig.archivePath)
    }

    for (const patchPath of plan.droppedPatchPaths) {
      // Defense in depth, as an allow-list rather than a list of things not to
      // delete: a declared patch path is user input reaching a delete, and it
      // can name any bundled file — an .npmrc carrying registry auth, a
      // pnpmfile the lockfile records a checksum for, or a `.patch` fixture
      // that a check's own `include` glob put in the bundle. Only the
      // conventional location the auto-include adds patches from is removable;
      // a patch kept elsewhere simply stays, inert, exactly as an
      // unreferenced one does.
      if (!isRemovablePatchPath(patchPath)) {
        debug(`Refusing to drop ${patchPath}: outside the conventional patches directory`)
        continue
      }
      this.#files.delete(patchPath)
    }

    this.#files.set(pruned.archivePath, {
      filePath: context.workspace.lockfile.unwrap(),
      physical: false,
      content: plan.lockfileContent,
    })

    return {
      ...pruned,
      content: plan.lockfileContent,
      hash: createHash('sha256').update(plan.lockfileContent).digest(),
    }
  }

  async #pruneLockfile (
    context: WorkspaceBundleContext,
  ): Promise<{ pruned?: PrunedLockfile, consistent?: boolean }> {
    const result = await pruneBundledLockfile({
      workspace: context.workspace,
      packageManager: context.packageManager,
      files: this.#files,
      rewrittenManifests: this.#rewrittenManifests,
    })

    if (result.status === 'failed') {
      process.stderr.write(
        `Warning: could not prune the bundled lockfile: ${result.reason}. `
        + `Falling back to the original lockfile; it may reference workspace packages and `
        + `dependencies that are not part of the bundle. If the lockfile is out of date, `
        + `run your package manager's install to refresh it; set CHECKLY_LOCKFILE_PRUNE=0 `
        + `to disable pruning.\n`,
      )
      return {}
    }
    if (result.status === 'skipped') {
      if (result.notable) {
        // The bundle is a partial workspace, so the unpruned lockfile
        // over-describes it — say so instead of failing silently on the
        // remote install.
        process.stderr.write(
          `Note: the bundled lockfile was not pruned (${result.reason}); it may reference `
          + `workspace packages and dependencies that are not part of the bundle. If this `
          + `setup cannot be pruned, set CHECKLY_LOCKFILE_PRUNE=0 to opt out of pruning `
          + `(and this note) entirely.\n`,
        )
      } else {
        debug(`Lockfile pruning skipped: ${result.reason}`)
      }
      return { consistent: result.consistent }
    }

    // Set entries directly rather than through registerFiles: its
    // prefer-physical dedup would keep the original lockfile, and would drop
    // a backfilled manifest whose path is occupied by a symlink entry —
    // desyncing the bundle from the lockfile the prune was computed against.
    for (const manifest of result.backfilledManifests) {
      this.#files.set(archivePath(manifest, this.#stripPrefix), manifest)
    }
    this.#files.set(result.archivePath, {
      filePath: context.workspace.lockfile.unwrap(),
      physical: false,
      content: result.content,
    })
    debug(`Pruned bundled lockfile ${result.archivePath}`)

    return {
      pruned: {
        name: path.posix.basename(result.archivePath),
        hash: createHash('sha256').update(result.content).digest(),
        content: result.content,
        archivePath: result.archivePath,
        originalContent: result.originalContent,
      },
    }
  }

  async finalize (): Promise<FinalizedBundleArchive> {
    await this.#refreshWorkspaceBundle()

    const archive = await BundleArchive.create({
      tempDir: this.#tempDir,
      stripPrefix: this.#stripPrefix,
    })

    const files = dropSymlinksWithChildren(
      Array.from(this.#files.entries()).sort(([a], [b]) => a.localeCompare(b)),
    )

    await archive.add(...files)

    return await archive.finalize()
  }
}

async function createArchiver (): Promise<Archiver> {
  // Dynamic import for CommonJs so it doesn't break when using checkly/playwright-reporter archiver
  // The custom Checkly fork of archiver exports TarArchive class instead of a default function
  const archiverModule: any = await import('archiver')
  if (archiverModule.TarArchive) {
    // Using Checkly's custom fork which exports TarArchive class
    return new archiverModule.TarArchive({ gzip: true, gzipOptions: { level: 9 } })
  } else if (archiverModule.default) {
    // Using standard archiver which has a default factory function
    return archiverModule.default('tar', { gzip: true, gzipOptions: { level: 9 } })
  } else {
    throw new Error('Unable to initialize archiver: neither TarArchive nor default export found')
  }
}

export class BundlePathMarker {
  #value: string

  constructor (initialValue: string) {
    this.#value = initialValue
  }

  updateValue (newValue: string) {
    this.#value = newValue
  }

  toJSON (): string {
    return this.#value
  }
}

/**
 * Mutable holder for the dependency cache hash, serialized as a plain
 * string. See {@link Bundler.cacheHash} for why a holder is needed.
 *
 * Deliberately a standalone class rather than a subclass of
 * {@link BundlePathMarker}: the own `#value` field makes the two marker
 * types nominally incompatible, so a bundle path cannot be passed where the
 * cache hash is expected (or vice versa) without a compile error.
 */
export class CacheHashMarker {
  #value: string

  constructor (initialValue: string) {
    this.#value = initialValue
  }

  updateValue (newValue: string) {
    this.#value = newValue
  }

  toJSON (): string {
    return this.#value
  }
}
