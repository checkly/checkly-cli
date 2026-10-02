import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

/**
 * Lowercase hex SHA-256 of a file's contents.
 *
 * The deploy payload carries one of these per uploaded artifact — every
 * Playwright visual snapshot and the code bundle archive — so Checkly can tell
 * an unchanged upload from a new one by content rather than by storage key,
 * which changes on every upload. A hash is also computable before anything is
 * uploaded, which is what lets `checkly deploy` ask what a deploy would change
 * without uploading first.
 *
 * Streamed rather than read into a buffer: a bundle archive or a full-page
 * screenshot can be tens of megabytes, and several are hashed per deploy.
 */
export async function sha256OfFile (filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}
