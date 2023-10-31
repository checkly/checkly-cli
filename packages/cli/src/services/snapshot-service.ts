import * as fsAsync from 'node:fs/promises'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as stream from 'node:stream/promises'
import * as https from 'node:https'
import axios from 'axios'

import { checklyStorage } from '../rest/api'
import { findFilesRecursively, pathToPosix } from './util'
import { BrowserCheck } from '../constructs'
import type { Project } from '../constructs'

export interface Snapshot {
  key: string,
  path: string,
}

export async function pullSnapshots (basePath: string, snapshots?: Snapshot[] | null) {
  if (!snapshots?.length) {
    return
  }

  let signedUrls
  try {
    ({ data: signedUrls } = await checklyStorage.getSignedUrls(snapshots.map(({ key }) => key)))
  } catch (err: any) {
    throw new Error(`Error getting signed URLs for snapshots: ${err.message}`)
  }

  const signedUrlsByKey: Map<string, string> = signedUrls!.reduce((acc, entry) => {
    acc.set(entry.key, entry.signedUrl)
    return acc
  }, new Map())

  await Promise.all(snapshots.map(async snapshot => {
    const signedUrl = signedUrlsByKey.get(snapshot.key)
    if (!signedUrl) {
      throw new Error(`Unexpected error fetching signed URL for snapshot ${snapshot.key}`)
    }

    const fullPath = path.resolve(basePath, snapshot.path)
    if (!fullPath.startsWith(basePath)) {
      // The snapshot file should always be within the project, but we validate this just in case.
      throw new Error(`Detected invalid snapshot file ${fullPath}`)
    }

    // We write the file as a stream to use less memory
    let snapshotStream
    try {
      // TODO: Add support for proxies
      ({ data: snapshotStream } = await axios.get(signedUrl, { responseType: 'stream' }))
    } catch (err: any) {
      throw new Error(`Error fetching snapshot: ${err.message}`)
    }

    await fsAsync.mkdir(path.dirname(fullPath), { recursive: true })
    const fileStream = fs.createWriteStream(fullPath)
    try {
      snapshotStream.pipe(fileStream)
      await stream.finished(snapshotStream)
    } catch (err: any) {
      // See https://nodejs.org/api/stream.html#readablepipedestination-options
      // and https://nodejs.org/docs/latest-v16.x/api/fs.html#filehandlecreatewritestreamoptions
      // If contentStream emits an error then fileStream is not closed automatically.
      // Destroying the stream will close the underlying file descriptor.
      // Probably doesn't matter since the CLI will exit, but can't hurt to clean up.
      fileStream.destroy()
      throw new Error(`Error writing snapshots to a file: ${err.message}`)
    }
  }))
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

export async function uploadSnapshots (project: Project) {
  // TODO: Processing the whole project at ocne let's us reuse an httpsAgent and make a single
  // request to get the signed upload URL's.
  // Having this method just process a single check would probably be much more clear, though.
  // Are there actual performance gains, or should we rewrite it?
  const snapshotFiles = Object.values(project.data.check).flatMap(check => {
    if (!(check instanceof BrowserCheck)) {
      return []
    }
    return check.rawSnapshots?.map(({ path }) => path) ?? []
  })

  if (!snapshotFiles.length) {
    return []
  }

  const { data: signedUploadUrls } = await checklyStorage.getSignedUploadUrls(snapshotFiles)
  // Reusing a single https will save from having an SSL handshake with every file upload.
  // Should improve performance somewhat (but haven't profiled this)
  const httpsAgent = new https.Agent({ keepAlive: true })

  for (const check of Object.values(project.data.check)) {
    if (!(check instanceof BrowserCheck) || !check.rawSnapshots?.length) {
      continue
    }

    const checkSnapshotsAbsolutePaths = check.rawSnapshots.reduce((acc, { absolutePath, path }) => {
      acc.set(path, absolutePath)
      return acc
    }, new Map())

    const processedSnapshots = []
    for (const { signedUrl, key, path } of signedUploadUrls) {
      const absolutePath = checkSnapshotsAbsolutePaths.get(path)
      const { size } = await fsAsync.stat(absolutePath)
      const snapshotStream = fs.createReadStream(absolutePath)
      try {
        await axios.put(signedUrl, snapshotStream, { httpsAgent, headers: { 'Content-Length': size } })
      } catch (err: any) {
        throw new Error(`Error pushing snapshot file to storage: ${err.message}`)
      }
      processedSnapshots.push({ key, path })
    }
    check.snapshots = processedSnapshots
  }
}
