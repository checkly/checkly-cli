import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadDotenvFile } from '../load-dotenv.js'

describe('loadDotenvFile', () => {
  let tempDir: string
  let originalCwd: typeof process.cwd
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-dotenv-'))
    originalCwd = process.cwd
    process.cwd = () => tempDir

    for (const key of ['TEST_DOTENV_A', 'TEST_DOTENV_B', 'CHECKLY_NO_DOTENV']) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(async () => {
    process.cwd = originalCwd
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('loads variables from .env into process.env', async () => {
    await fs.writeFile(path.join(tempDir, '.env'), 'TEST_DOTENV_A=hello\nTEST_DOTENV_B=world\n')

    await loadDotenvFile()

    expect(process.env.TEST_DOTENV_A).toBe('hello')
    expect(process.env.TEST_DOTENV_B).toBe('world')
  })

  it('does not override existing env vars', async () => {
    process.env.TEST_DOTENV_A = 'original'
    await fs.writeFile(path.join(tempDir, '.env'), 'TEST_DOTENV_A=overwritten\n')

    await loadDotenvFile()

    expect(process.env.TEST_DOTENV_A).toBe('original')
  })

  it('does nothing when .env does not exist', async () => {
    await expect(loadDotenvFile()).resolves.toBeUndefined()
  })

  it('does nothing when CHECKLY_NO_DOTENV=1', async () => {
    process.env.CHECKLY_NO_DOTENV = '1'
    await fs.writeFile(path.join(tempDir, '.env'), 'TEST_DOTENV_A=should-not-load\n')

    await loadDotenvFile()

    expect(process.env.TEST_DOTENV_A).toBeUndefined()
  })

  it('still loads when CHECKLY_NO_DOTENV is set to something other than "1"', async () => {
    process.env.CHECKLY_NO_DOTENV = 'true'
    await fs.writeFile(path.join(tempDir, '.env'), 'TEST_DOTENV_A=loaded\n')

    await loadDotenvFile()

    expect(process.env.TEST_DOTENV_A).toBe('loaded')
  })

  it('handles empty .env file', async () => {
    await fs.writeFile(path.join(tempDir, '.env'), '')

    await expect(loadDotenvFile()).resolves.toBeUndefined()
  })

  // fs.chmod(0o000) does not restrict reads on Windows
  it.skipIf(process.platform === 'win32')('handles permission errors gracefully', async () => {
    const envPath = path.join(tempDir, '.env')
    await fs.writeFile(envPath, 'TEST_DOTENV_A=secret\n')
    await fs.chmod(envPath, 0o000)

    const stderrWrite = process.stderr.write
    let stderrOutput = ''
    process.stderr.write = ((chunk: string) => {
      stderrOutput += chunk
      return true
    }) as typeof process.stderr.write

    try {
      await expect(loadDotenvFile()).resolves.toBeUndefined()
      expect(stderrOutput).toContain('Warning')
      expect(process.env.TEST_DOTENV_A).toBeUndefined()
    } finally {
      process.stderr.write = stderrWrite
      await fs.chmod(envPath, 0o644)
    }
  })
})
