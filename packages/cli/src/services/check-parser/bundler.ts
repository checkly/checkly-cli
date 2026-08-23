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
  FauxPackageJsonInput,
  loadWorkspaceCacheHashInputs,
  LockfileInput,
} from './cache-hash.js'
import { pruneBundledLockfile } from './lockfile-pruner.js'
import { PackageManager } from './package-files/package-manager.js'
import { File } from './parser.js'
import { Workspace } from './package-files/workspace.js'
import { pathToPosix } from '../util.js'

const debug = Debug('checkly:cli:services:check-parser:bundler')

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
  }

interface PrunedLockfile extends LockfileInput {
  /**
   * The pruned lockfile bytes, needed to decide which embedded package
   * tarballs the shipped lockfile still references. Inert for the cache
   * hash, which only consumes the name and hash.
   */
  content: string
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
    } = options

    const embeddedPackages = (await embeddedPackagesMaterializer?.plan())?.tarballs

    // The composition is captured so finalize() can recompute the hash with
    // bundle-time additions (faux manifests, a pruned lockfile) from the
    // same workspace inputs, loaded once. The eager value below is only a
    // placeholder for the window before finalize() runs — finalize() always
    // recomputes it.
    const cacheHashInputs = await loadWorkspaceCacheHashInputs(workspace)
    const composeCacheHash = (extra: BundleTimeCacheHashInputs): string => {
      return composeWorkspaceCacheHash(cacheHashInputs, {
        dependencyCacheVersion,
        ...extra,
      })
    }

    return new Bundler({
      tempDir,
      cacheHash: composeCacheHash({ embeddedPackages }),
      stripPrefix: workspace?.root.path,
      workspaceContext: {
        workspace,
        packageManager,
        embeddedPackagesMaterializer,
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

    const pruned = await this.#pruneLockfile(context)
    const embeddedPackages = await this.#materializeEmbeddedPackages(context, pruned)

    const fauxPackageJsons: FauxPackageJsonInput[] = []
    for (const [archivePath, file] of this.#files) {
      if (file.physical || path.posix.basename(archivePath) !== 'package.json') {
        continue
      }
      fauxPackageJsons.push({ path: archivePath, raw: Buffer.from(file.content, 'utf8') })
    }

    // Unconditional: with no faux manifests, no pruned lockfile and an
    // unfiltered embedded set this reproduces the exact digest computed in
    // createForWorkspace (empty record groups write nothing).
    this.#cacheHashMarker.updateValue(context.composeCacheHash({
      fauxPackageJsons,
      prunedLockfile: pruned,
      embeddedPackages,
    }))
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

  async #pruneLockfile (context: WorkspaceBundleContext): Promise<PrunedLockfile | undefined> {
    const result = await pruneBundledLockfile({
      workspace: context.workspace,
      packageManager: context.packageManager,
      files: this.#files,
    })

    if (result.status === 'failed') {
      process.stderr.write(
        `Warning: could not prune the bundled lockfile: ${result.reason}. `
        + `Falling back to the original lockfile; it may reference workspace packages and `
        + `dependencies that are not part of the bundle. If the lockfile is out of date, `
        + `run your package manager's install to refresh it; set CHECKLY_LOCKFILE_PRUNE=0 `
        + `to disable pruning.\n`,
      )
      return
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
      return
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
      name: path.posix.basename(result.archivePath),
      hash: createHash('sha256').update(result.content).digest(),
      content: result.content,
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
