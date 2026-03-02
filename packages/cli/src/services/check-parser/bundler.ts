import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, WriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { AxiosResponse } from 'axios'
import type { Archiver } from 'archiver'
import Debug from 'debug'
import * as uuid from 'uuid'

import { checklyStorage } from '../../rest/api'
import { File } from './parser'
import { Workspace } from './package-files/workspace'

const debug = Debug('checkly:cli:services:check-parser:bundler')

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

  // eslint-disable-next-line require-await
  async add (...files: File[]): Promise<void> {
    for (const file of files) {
      const name = this.#stripPrefix
        ? path.relative(this.#stripPrefix, file.filePath)
        : file.filePath

      const entry = {
        mode: 0o755, // Default mode for files in the archive
        name,
      }

      if (file.physical) {
        this.#archive.file(file.filePath, entry)
      } else {
        this.#archive.append(file.content, entry)
      }
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

    const cacheHashFile = workspace.lockfile.isOk()
      ? workspace.lockfile.ok()
      : workspace.root.packageJsonPath

    const cacheHash = await getCacheHash(cacheHashFile)

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

  registerFiles (...files: File[]): void {
    for (const newFile of files) {
      const existingFile = this.#files.get(newFile.filePath)
      if (existingFile) {
        // Prefer physical files.
        if (existingFile.physical && !newFile.physical) {
          continue
        }
      }

      this.#files.set(newFile.filePath, newFile)
    }
  }

  async finalize (): Promise<FinalizedBundleArchive> {
    const archive = await BundleArchive.create({
      tempDir: this.#tempDir,
      stripPrefix: this.#stripPrefix,
    })

    const files = Array.from(this.#files.values())
    files.sort((a, b) => {
      return a.filePath.localeCompare(b.filePath)
    })

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

export async function getCacheHash (lockFile: string): Promise<string> {
  const fileBuffer = await fs.readFile(lockFile)
  const hash = createHash('sha256')
  hash.update(fileBuffer)
  return hash.digest('hex')
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
