import * as fsAsync from 'node:fs/promises'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as stream from 'node:stream/promises'

import { checklyStorage } from '../rest/api'
import { findFilesRecursively, pathToPosix } from './util'

export interface Snapshot {
  key: string,
  path: string,
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
    throw new Error(`Error downloading snapshots: ${err.message}`)
  }
}

export function detectSnapshots (projectBasePath: string, scriptFilePath: string) {
  // By default, PWT will store snapshots in the `script.spec.js-snapshots` directory.
  // Other paths can be configured, though, and we should add support for those as well.
  // https://playwright.dev/docs/api/class-testconfig#test-config-snapshot-path-template
  const snapshotFiles = findFilesRecursively(`${scriptFilePath}-snapshots`)
  return snapshotFiles.map(absolutePath => ({
    absolutePath,
    path: pathToPosix(path.relative(projectBasePath, absolutePath)),
  }))
}

export async function uploadSnapshots (rawSnapshots?: Array<{ absolutePath: string, path: string }>) {
  if (!rawSnapshots?.length) {
    return []
  }

  try {
    const snapshots: Array<Snapshot> = []
    for (const rawSnapshot of rawSnapshots) {
      const snapshotStream = fs.createReadStream(rawSnapshot.absolutePath)
      const { size } = await fsAsync.stat(rawSnapshot.absolutePath)
      const { data: { key } } = await checklyStorage.upload(size, snapshotStream)
      snapshots.push({ key, path: rawSnapshot.path })
    }
    return snapshots
  } catch (err: any) {
    throw new Error(`Error uploading snapshots: ${err.message}`)
  }
}
