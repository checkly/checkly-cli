import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter()
    process.nextTick(() => child.emit('error', new Error('spawn EACCES')))
    return child
  }),
}))

const { NO_DELEGATION_ENV, runWithProjectCli } = await import('../project-cli.js')

describe('runWithProjectCli when the project install cannot be used', () => {
  let tempDir: string
  let originalCwd: typeof process.cwd
  let savedOptOut: string | undefined

  beforeEach(async () => {
    tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-project-cli-')))
    const dir = path.join(tempDir, 'node_modules', 'checkly')
    await fs.mkdir(path.join(dir, 'bin'), { recursive: true })
    await fs.writeFile(path.join(dir, 'bin', 'run.cjs'), '')
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'checkly',
      version: '1.2.3',
      bin: { checkly: './bin/run.cjs' },
    }))
    originalCwd = process.cwd
    process.cwd = () => tempDir
    savedOptOut = process.env[NO_DELEGATION_ENV]
    delete process.env[NO_DELEGATION_ENV]
  })

  afterEach(async () => {
    process.cwd = originalCwd
    if (savedOptOut !== undefined) {
      process.env[NO_DELEGATION_ENV] = savedOptOut
    }
    vi.restoreAllMocks()
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  const self = { root: os.tmpdir(), version: '10.0.0' }

  it('falls back to running the command itself', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(runWithProjectCli(['test'], self)).resolves.toBe(false)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Could not start the checkly install of this project'))
    expect(process.listenerCount('SIGTERM')).toBe(0)
  })

  it('falls back when the install cannot be read', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await fs.writeFile(path.join(tempDir, 'node_modules', 'checkly', 'package.json'), '{"name": "chec')

    await expect(runWithProjectCli(['test'], self)).resolves.toBe(false)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Could not read the checkly install of this project'))
  })
})
