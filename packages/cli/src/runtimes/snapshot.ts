import fs from 'node:fs/promises'
import path from 'node:path'

import { Runtime } from './runtime'

const SNAPSHOT_DATE = '20260130'

const ASSETS_PATH = path.join(__dirname, '..', '..', 'assets')

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
