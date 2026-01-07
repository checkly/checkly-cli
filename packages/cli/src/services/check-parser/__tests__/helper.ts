import path from 'node:path'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'

export async function usingIsolatedFixture (fixturePath: string, handle: (dir: string) => Promise<void>) {
  const tempPath = await fs.mkdtemp(path.join(tmpdir(), 'check-parser-'))
  try {
    await fs.cp(fixturePath, tempPath, {
      recursive: true,
    })

    await handle(tempPath)
  } finally {
    await fs.rm(tempPath, {
      recursive: true,
      force: true,
    })
  }
}
