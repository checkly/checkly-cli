import * as fsAsync from 'node:fs/promises'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as stream from 'node:stream/promises'
import axios from 'axios'

import { checklyStorage } from '../rest/api'

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
    ({ data: signedUrls } = await checklyStorage.getPresignedUrls(snapshots.map(({ key }) => key)))
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
