import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import hook from '../update-check.js'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}))

const DAY_MS = 24 * 60 * 60 * 1000

describe('update-check hook', () => {
  let cacheDir: string
  let warn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-check-'))
    warn = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    fs.rmSync(cacheDir, { recursive: true, force: true })
  })

  function makeConfig (version = '9.0.0') {
    const scopedEnvVar = (key: string) => process.env[`CHECKLY_${key}`]
    return {
      name: 'checkly',
      version,
      cacheDir,
      windows: false,
      npmRegistry: undefined,
      scopedEnvVar,
      scopedEnvVarTrue: (key: string) => ['true', '1'].includes(scopedEnvVar(key) ?? ''),
    }
  }

  async function run (version?: string) {
    await hook.call({ warn } as any, { config: makeConfig(version), argv: [], id: undefined, context: {} } as any)
  }

  function writeVersionCache (distTags: Record<string, string>, ageMs = 0) {
    const file = path.join(cacheDir, 'version')
    fs.writeFileSync(file, JSON.stringify(distTags))
    const time = new Date(Date.now() - ageMs)
    fs.utimesSync(file, time, time)
  }

  it('warns when the cached latest version is newer', async () => {
    writeVersionCache({ latest: '9.1.0' })
    await run('9.0.0')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('update available from')
    expect(warn.mock.calls[0][0]).toContain('9.1.0')
    expect(fs.existsSync(path.join(cacheDir, 'last-warning'))).toBe(true)
  })

  it('compares versions numerically', async () => {
    writeVersionCache({ latest: '9.10.0' })
    await run('9.9.0')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not warn when the running version is current', async () => {
    writeVersionCache({ latest: '9.0.0' })
    await run('9.0.0')
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not warn for prerelease versions', async () => {
    writeVersionCache({ latest: '9.1.0' })
    await run('0.0.1-dev')
    expect(warn).not.toHaveBeenCalled()
  })

  it('uses CHECKLY_NEW_VERSION_CHECK_TAG to pick the dist-tag', async () => {
    vi.stubEnv('CHECKLY_NEW_VERSION_CHECK_TAG', 'next')
    writeVersionCache({ latest: '9.0.0', next: '10.0.0' })
    await run('9.0.0')
    expect(warn.mock.calls[0][0]).toContain('10.0.0')
  })

  it('does not warn again within CHECKLY_NEW_VERSION_CHECK_FREQ', async () => {
    vi.stubEnv('CHECKLY_NEW_VERSION_CHECK_FREQ', '1')
    vi.stubEnv('CHECKLY_NEW_VERSION_CHECK_FREQ_UNIT', 'days')
    writeVersionCache({ latest: '9.1.0' })
    await run('9.0.0')
    await run('9.0.0')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('skips the warning and the refresh with CHECKLY_SKIP_NEW_VERSION_CHECK', async () => {
    vi.stubEnv('CHECKLY_SKIP_NEW_VERSION_CHECK', 'true')
    writeVersionCache({ latest: '9.1.0' }, 60 * DAY_MS)
    await run('9.0.0')
    expect(warn).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('refreshes in the background when there is no cache', async () => {
    await run()
    expect(spawn).toHaveBeenCalledTimes(1)
    const [execPath, args, options] = vi.mocked(spawn).mock.calls[0] as any[]
    expect(execPath).toEqual(process.execPath)
    expect(args[0]).toMatch(/refresh-latest-version\.js$/)
    expect(args.slice(1)).toEqual(['checkly', path.join(cacheDir, 'version'), '9.0.0', ''])
    expect(options).toEqual({ detached: true, stdio: 'ignore' })
  })

  it('does not refresh a fresh cache', async () => {
    writeVersionCache({ latest: '9.0.0' }, 29 * DAY_MS)
    await run()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('refreshes a stale cache', async () => {
    writeVersionCache({ latest: '9.0.0' }, 31 * DAY_MS)
    await run()
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('refreshes a fresh cache with CHECKLY_FORCE_VERSION_CACHE_UPDATE', async () => {
    vi.stubEnv('CHECKLY_FORCE_VERSION_CACHE_UPDATE', '1')
    writeVersionCache({ latest: '9.0.0' })
    await run()
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('ignores a corrupt cache file', async () => {
    fs.writeFileSync(path.join(cacheDir, 'version'), '{ not json')
    await expect(run()).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })
})
