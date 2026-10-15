import fs from 'node:fs/promises'
import path from 'node:path'

import { packageRoot } from '../services/package-root.js'
import { Runtime } from './runtime.js'

const SNAPSHOT_DATE = '20260130'

// Anchored at the package root (not this module's own depth) so the path also
// resolves when the CLI runs from the esbuild bundle in dist/bundle/.
const ASSETS_PATH = path.join(packageRoot(), 'assets')

export async function loadSnapshot (): Promise<Runtime[]> {
  const data = await fs.readFile(path.join(
    ASSETS_PATH,
    'runtimes',
    'snapshots',
    SNAPSHOT_DATE,
    'runtimes.json',
  ))

  return JSON.parse(data.toString())
}
