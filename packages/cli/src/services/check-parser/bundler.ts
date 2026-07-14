import { createReadStream, createWriteStream, WriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { AxiosResponse } from 'axios'
import type { Archiver } from 'archiver'
import Debug from 'debug'
import * as uuid from 'uuid'

import { checklyStorage } from '../../rest/api.js'
import { computeWorkspaceCacheHash } from './cache-hash.js'
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

  return stripPrefix
    ? path.relative(stripPrefix, file.filePath)
    : file.filePath
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
 * The link is what goes, rather than the files: the files are content, and they
 * extract perfectly well as ordinary files, whereas the link takes the whole
 * archive down with it.
 */
function dropSymlinksWithChildren (entries: Array<[string, File]>): File[] {
  const directories = new Set<string>()

  for (const [name] of entries) {
    for (
      let parent = path.posix.dirname(pathToPosix(name));
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

      if (!directories.has(pathToPosix(name))) {
        return true
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

export interface CreateFinalizedBundleArchiveOptions {
  archiveFile: string
}

interface FinalizedBundleArchiveOptions {
  archiveFile: string
}

export class FinalizedBundleArchive {
  #archiveFile: string

  private constructor (options: FinalizedBundleArchiveOptions) {
    const {
      archiveFile,
    } = options

    this.#archiveFile = archiveFile
  }

  // eslint-disable-next-line require-await
  static async create (options: CreateFinalizedBundleArchiveOptions): Promise<FinalizedBundleArchive> {
    return new FinalizedBundleArchive(options)
  }

  get archiveFile (): string {
    return this.#archiveFile
  }

  async store (): Promise<RemoteBundleArchive> {
    const {
      data: {
        key,
      },
    } = await this.#uploadCodeBundle(this.#archiveFile)

    return await RemoteBundleArchive.create({
      key,
    })
  }

  async #uploadCodeBundle (filePath: string): Promise<AxiosResponse> {
    const { size } = await fs.stat(filePath)
    const stream = createReadStream(filePath)
    stream.on('error', err => {
      throw new Error(`Failed to read Playwright project file: ${err.message}`)
    })
    return checklyStorage.uploadCodeBundle(stream, size)
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

export type CreateBundlerForWorkspaceOptions = Omit<CreateBundlerOptions, 'cacheHash' | 'stripPrefix'>

interface BundlerOptions {
  tempDir?: string
  cacheHash: string
  stripPrefix?: string
}

export class Bundler {
  #id: string
  #marker: BundlePathMarker
  #cacheHash: string
  #tempDir?: string
  #stripPrefix?: string
  #files = new Map<string, File>()

  private constructor (options: BundlerOptions) {
    const {
      tempDir,
      cacheHash,
      stripPrefix,
    } = options

    this.#id = uuid.v4()
    this.#marker = new BundlePathMarker(`bundle:${this.#id}`)
    this.#cacheHash = cacheHash
    this.#stripPrefix = stripPrefix
    this.#tempDir = tempDir
  }

  // eslint-disable-next-line require-await
  static async create (options: CreateBundlerOptions): Promise<Bundler> {
    debug(`Creating bundler`)
    return new Bundler(options)
  }

  static async createForWorkspace (
    workspace: Workspace,
    options: CreateBundlerForWorkspaceOptions = {},
  ): Promise<Bundler> {
    debug(`Creating bundler for workspace`)

    const {
      tempDir,
    } = options

    const cacheHash = await computeWorkspaceCacheHash(workspace)

    return new Bundler({
      tempDir,
      cacheHash,
      stripPrefix: workspace?.root.path,
    })
  }

  get marker (): BundlePathMarker {
    return this.#marker
  }

  updateMarker (newValue: string): void {
    this.#marker.updateValue(newValue)
  }

  get cacheHash (): string {
    return this.#cacheHash
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

  async finalize (): Promise<FinalizedBundleArchive> {
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
