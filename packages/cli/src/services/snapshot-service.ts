import * as fsAsync from 'node:fs/promises'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as stream from 'node:stream/promises'

import PQueue from 'p-queue'

import { checklyStorage } from '../rest/api.js'
import { sha256OfFile } from './content-hash.js'
import { findFilesRecursively, pathToPosix } from './util.js'

/** How many snapshot files are hashed at once. */
const SNAPSHOT_HASH_CONCURRENCY = 8

/**
 * A snapshot file as it exists locally, before any upload. `sha256` describes
 * the file's content, so a snapshot can be reported to Checkly — in a deploy
 * preview, for instance — while `key`, which only the upload produces, is
 * still unknown.
 */
export interface RawSnapshot {
  absolutePath: string
  path: string
  sha256: string
}

export interface Snapshot {
  key: string
  path: string
  /** Absent on snapshots read back from the API, which only stores it on deploy. */
  sha256?: string
}

/**
 * The content hashes only a deploy sends.
 *
 * A check's payload is synthesized the same way for a deploy and for a test
 * session, but only the deploy compares content hashes — and only the deploy
 * schemas accept them. Keeping them out of a run request means a CLI published
 * before the matching API is deployed still runs tests, rather than having
 * every browser check with snapshots and every Playwright suite rejected.
 */
export function stripContentHashes<T extends Record<string, unknown>> (payload: T): T {
  const stripped: Record<string, unknown> = { ...payload }
  delete stripped.codeBundleSha256

  if (Array.isArray(stripped.snapshots)) {
    stripped.snapshots = (stripped.snapshots as Snapshot[]).map(snapshot => {
      const entry: Partial<Snapshot> = { ...snapshot }
      delete entry.sha256
      return entry
    })
  }

  return stripped as T
}

export async function pullSnapshots (basePath: string, snapshots?: Snapshot[] | null) {
  if (!snapshots?.length) {
    return
  }

  try {
    for (const snapshot of snapshots) {
      const fullPath = path.resolve(basePath, snapshot.path)
      if (!fullPath.startsWith(basePath)) {
        // The snapshot file should always be within the project, but we validate this just in case.
        throw new Error(`Detected invalid snapshot file ${fullPath}`)
      }
      await fsAsync.mkdir(path.dirname(fullPath), { recursive: true })
      const fileStream = fs.createWriteStream(fullPath)
      const { data: contentStream } = await checklyStorage.download(snapshot.key)
      contentStream.pipe(fileStream)
      await stream.finished(contentStream)
    }
  } catch (err: any) {
    throw new Error(`Error downloading snapshots: ${err.message}`, { cause: err })
  }
}

export async function detectSnapshots (
  projectBasePath: string,
  scriptFilePath: string,
): Promise<RawSnapshot[]> {
  // By default, PWT will store snapshots in the `script.spec.js-snapshots` directory.
  // Other paths can be configured, though, and we should add support for those as well.
  // https://playwright.dev/docs/api/class-testconfig#test-config-snapshot-path-template
  const snapshotFiles = findFilesRecursively(`${scriptFilePath}-snapshots`)
  // Hashed here rather than at upload time so the hash is available whether or
  // not the snapshot is ever uploaded (see {@link RawSnapshot}). Bounded,
  // because each hash opens a read stream and a project can hold hundreds of
  // baselines across as many checks as it has.
  const queue = new PQueue({ concurrency: SNAPSHOT_HASH_CONCURRENCY })
  return await Promise.all(snapshotFiles.map(absolutePath => queue.add(async () => ({
    absolutePath,
    path: pathToPosix(path.relative(projectBasePath, absolutePath)),
    sha256: await sha256OfFile(absolutePath),
  })) as Promise<RawSnapshot>))
}

export async function uploadSnapshots (rawSnapshots?: RawSnapshot[]) {
  if (!rawSnapshots?.length) {
    return []
  }

  try {
    const snapshots: Array<Snapshot> = []
    for (const rawSnapshot of rawSnapshots) {
      // Re-hashed rather than reusing the hash from detection: a deploy asks
      // what it would change before it uploads, and the answer has to be
      // confirmed first, so the file may have been edited in between. The hash
      // that ships with the upload describes what was uploaded.
      const sha256 = await sha256OfFile(rawSnapshot.absolutePath)
      if (sha256 !== rawSnapshot.sha256) {
        // The plan the user just saw described the older content, so say which
        // file moved rather than quietly deploying something else.
        process.stderr.write(
          `Warning: ${rawSnapshot.path} changed after the deploy was planned; `
          + 'the content being uploaded is the one on disk now.\n',
        )
      }
      const snapshotStream = fs.createReadStream(rawSnapshot.absolutePath)
      const { data: { key } } = await checklyStorage.upload(snapshotStream)
      snapshots.push({ key, path: rawSnapshot.path, sha256 })
    }
    return snapshots
  } catch (err: any) {
    throw new Error(`Error uploading snapshots: ${err.message}`, { cause: err })
  }
}
