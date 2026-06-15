import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AssetManifest } from '../../rest/asset-manifests.js'

vi.mock('../../rest/api.js', () => ({
  assetManifests: {
    getForCheckResult: vi.fn(),
    getForTestSessionResult: vi.fn(),
  },
  api: {
    get: vi.fn(),
  },
}))

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

import axios from 'axios'
import * as api from '../../rest/api.js'
import AssetsList from '../assets/list.js'
import AssetsDownload from '../assets/download.js'

const manifest: AssetManifest = {
  assets: [
    {
      type: 'log',
      name: 'logs.txt',
      url: '/download/logs',
      contentType: 'text/plain',
      source: 'runner',
    },
    {
      type: 'trace',
      name: 'trace.zip',
      url: '/download/trace',
      contentType: 'application/zip',
      source: 'runner',
      archive: { entryName: 'traces/checkout trace.zip' },
    },
    {
      type: 'screenshot',
      name: 'page.png',
      url: '/download/page',
      contentType: 'image/png',
      source: 'runner',
    },
    {
      type: 'file',
      name: 'duplicate.txt',
      url: '/download/duplicate-a',
      source: 'runner',
      archive: { entryName: 'a/duplicate.txt' },
    },
    {
      type: 'file',
      name: 'duplicate.txt',
      url: '/download/duplicate-b',
      source: 'runner',
      archive: { entryName: 'b/duplicate.txt' },
    },
  ],
}

const truncatedManifest: AssetManifest = {
  ...manifest,
  truncated: true,
  entriesReturned: 5,
  entriesTotal: 12,
}

const archiveOnlyManifest: AssetManifest = {
  assets: [
    {
      type: 'log',
      name: 'logs.txt',
      url: 'https://api.checkly.test/next/assets/check-run-data/eu-central-1/account%2Fsession%2Fresult%2Fassets.zip/redirect',
      contentType: 'application/json',
      source: 'runner',
      archive: { entryName: 'logs.txt' },
    },
    {
      type: 'report',
      name: 'checkly-report.json',
      url: 'https://api.checkly.test/next/assets/check-run-data/eu-central-1/account%2Fsession%2Fresult%2Fassets.zip/redirect',
      contentType: 'application/json',
      source: 'runner',
      archive: { entryName: 'output/checkly-report.json' },
    },
  ],
}

function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    style: {
      outputFormat: undefined,
      actionStart: vi.fn(),
      actionStatus: vi.fn(),
      actionSuccess: vi.fn(),
      actionFailure: vi.fn(),
      longError: vi.fn(),
    },
    fancy: false,
    logged,
  }
}

describe('assets commands', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    process.exitCode = undefined
    originalCwd = process.cwd()
    tempDir = await realpath(await mkdtemp(path.join(tmpdir(), 'checkly-assets-test-')))
    process.chdir(tempDir)
    vi.mocked(api.assetManifests.getForCheckResult).mockResolvedValue(manifest)
    vi.mocked(api.assetManifests.getForTestSessionResult).mockResolvedValue(manifest)
    vi.mocked(api.api.get).mockResolvedValue({ data: Readable.from(['downloaded']) } as any)
    vi.mocked(axios.get).mockResolvedValue({ data: Readable.from(['downloaded']) } as any)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('validates source flags', async () => {
    const missing = createCommandContext({
      flags: { 'result-id': 'result-id', 'output': 'table' },
    })
    await expect(AssetsList.prototype.run.call(missing as any))
      .rejects
      .toThrow('Use exactly one of --check-id or --test-session-id.')

    const both = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'test-session-id': 'session-id',
        'result-id': 'result-id',
        'output': 'table',
      },
    })
    await expect(AssetsList.prototype.run.call(both as any))
      .rejects
      .toThrow('Use exactly one of --check-id or --test-session-id, not both.')
  })

  it('lists check result assets as a table with copyable Asset values and truncation warning', async () => {
    vi.mocked(api.assetManifests.getForCheckResult).mockResolvedValue(truncatedManifest)
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'type': 'all',
        'view': 'table',
        'output': 'table',
      },
    })

    await AssetsList.prototype.run.call(ctx as any)

    expect(api.assetManifests.getForCheckResult).toHaveBeenCalledWith('check-id', 'result-id')
    expect(ctx.logged[0]).toContain('Assets for check result')
    expect(ctx.logged[0]).toContain('Check ID:')
    expect(ctx.logged[0]).toContain('check-id')
    expect(ctx.logged[0]).toContain('Result ID:')
    expect(ctx.logged[0]).toContain('result-id')
    expect(ctx.logged[0]).toContain('Showing:')
    expect(ctx.logged[0]).toContain('trace 1')
    expect(ctx.logged[0]).toContain('Storage:')
    expect(ctx.logged[0]).toContain('2 direct files, 3 files inside 3 archives')
    expect(ctx.logged[0]).toContain('Download:')
    expect(ctx.logged[0]).toContain('archive entries download as their containing archive')
    expect(ctx.logged[0]).toContain('logs.txt')
    expect(ctx.logged[0]).toContain('traces/checkout trace.zip')
    expect(ctx.logged[0]).toContain('Next:')
    expect(ctx.logged[0]).toContain('Download files:')
    expect(ctx.logged[0]).toContain('Warning: asset manifest is truncated (5 of 12 entries returned).')
  })

  it('lists test-session result assets as filtered JSON without human warnings', async () => {
    vi.mocked(api.assetManifests.getForTestSessionResult).mockResolvedValue(truncatedManifest)
    const ctx = createCommandContext({
      flags: {
        'test-session-id': 'session-id',
        'result-id': 'result-id',
        'type': 'trace',
        'view': 'tree',
        'output': 'json',
      },
    })

    await AssetsList.prototype.run.call(ctx as any)

    expect(api.assetManifests.getForTestSessionResult).toHaveBeenCalledWith('session-id', 'result-id', {
      type: 'trace',
    })
    expect(JSON.parse(ctx.logged[0])).toEqual({
      data: [manifest.assets[1]],
      pagination: {
        length: 1,
      },
    })
    expect(ctx.logged[0]).not.toContain('Assets for test-session result')
    expect(ctx.logged[0]).not.toContain('checkout trace.zip (trace')
  })

  it('renders list markdown output', async () => {
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'type': 'log',
        'view': 'table',
        'output': 'md',
      },
    })

    await AssetsList.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('| Type | Name | Asset | Content Type |')
    expect(ctx.logged[0]).toContain('| log | logs.txt | logs.txt | text/plain |')
  })

  it('renders list tree output for nested asset paths', async () => {
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'type': 'all',
        'view': 'tree',
        'output': 'table',
      },
    })

    await AssetsList.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('traces/')
    expect(ctx.logged[0]).toContain('checkout trace.zip')
    expect(ctx.logged[0]).toContain('Tip: use --view table to copy exact Asset values for download.')
    expect(ctx.logged[0]).toContain('Next:')
  })

  it('explains archive-only manifests and shows an archive download command', async () => {
    vi.mocked(api.assetManifests.getForTestSessionResult).mockResolvedValue(archiveOnlyManifest)
    const ctx = createCommandContext({
      flags: {
        'test-session-id': 'session-id',
        'result-id': 'result-id',
        'type': 'all',
        'view': 'table',
        'output': 'table',
      },
    })

    await AssetsList.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('Storage: 2 files inside 1 archive')
    expect(ctx.logged[0]).toContain('archive entries download as the containing archive')
    expect(ctx.logged[0]).toContain('Download archive: checkly assets download --test-session-id session-id --result-id result-id')
    expect(ctx.logged[0]).toContain('Inspect entries:')
  })

  it('filters list output by exact asset name without treating duplicates as ambiguous', async () => {
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'type': 'all',
        'asset': 'duplicate.txt',
        'view': 'table',
        'output': 'table',
      },
    })

    await AssetsList.prototype.run.call(ctx as any)

    expect(api.assetManifests.getForCheckResult).toHaveBeenCalledWith('check-id', 'result-id', {
      name: 'duplicate.txt',
    })
    expect(ctx.logged[0]).toContain('Filter:')
    expect(ctx.logged[0]).toContain('asset=duplicate.txt')
    expect(ctx.logged[0]).toContain('a/duplicate.txt')
    expect(ctx.logged[0]).toContain('b/duplicate.txt')
    expect(ctx.logged[0]).not.toContain('logs.txt')
  })

  it('filters list JSON output by asset glob', async () => {
    const ctx = createCommandContext({
      flags: {
        'test-session-id': 'session-id',
        'result-id': 'result-id',
        'type': 'trace',
        'asset': 'TRACES/*.ZIP',
        'view': 'tree',
        'output': 'json',
      },
    })

    await AssetsList.prototype.run.call(ctx as any)

    expect(api.assetManifests.getForTestSessionResult).toHaveBeenCalledWith('session-id', 'result-id', {
      type: 'trace',
      name: 'TRACES/*.ZIP',
    })
    const parsed = JSON.parse(ctx.logged[0])
    expect(parsed.data).toEqual([manifest.assets[1]])
    expect(parsed.pagination).toEqual({
      length: 1,
    })
    expect(parsed).not.toHaveProperty('metadata')
    expect(parsed).not.toHaveProperty('source')
  })

  it('requires a download selector', async () => {
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'output': 'table',
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to download assets.',
      expect.objectContaining({
        message: 'Pass --type or --asset to select assets. Use --type all to download all assets.',
      }),
    )
    expect(process.exitCode).toBe(1)
  })

  it('downloads by exact asset selector to the default directory', async () => {
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'LOGS.TXT',
        'output': 'json',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    const summary = JSON.parse(ctx.logged[0])
    const expectedPath = path.join(tempDir, 'checkly-assets', 'check-result-result-id', 'logs.txt')
    expect(api.assetManifests.getForCheckResult).toHaveBeenCalledWith('check-id', 'result-id', {
      name: 'LOGS.TXT',
    })
    expect(api.api.get).toHaveBeenCalledWith('/download/logs', { responseType: 'stream' })
    expect(axios.get).not.toHaveBeenCalled()
    expect(summary.directory).toBe(path.dirname(expectedPath))
    expect(summary.files[0].path).toBe(expectedPath)
    expect(summary.files[0].status).toBe('written')
    await expect(readFile(expectedPath, 'utf8')).resolves.toBe('downloaded')
  })

  it('downloads absolute external asset URLs without the authenticated API client', async () => {
    vi.mocked(api.assetManifests.getForCheckResult).mockResolvedValue({
      assets: [{
        type: 'log',
        name: 'external-log.txt',
        url: 'https://assets.example.com/external-log.txt',
        contentType: 'text/plain',
        source: 'runner',
      }],
    })
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'external-log.txt',
        'output': 'json',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(api.api.get).not.toHaveBeenCalled()
    expect(axios.get).toHaveBeenCalledWith(
      'https://assets.example.com/external-log.txt',
      expect.objectContaining({ responseType: 'stream' }),
    )
    expect(vi.mocked(axios.get).mock.calls[0][1]?.headers).toBeUndefined()
    expect(JSON.parse(ctx.logged[0]).files[0].status).toBe('written')
  })

  it('renders single download human output as a full-path detail', async () => {
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'page.png',
        'output': 'table',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    const expectedPath = path.join(tempDir, 'checkly-assets', 'check-result-result-id', 'page.png')
    expect(ctx.logged[0]).toContain('Downloaded screenshot asset')
    expect(ctx.logged[0]).toContain(`Path: ${expectedPath}`)
    expect(ctx.logged[0]).not.toContain('ASSET')
  })

  it('renders multiple archive download human output with full archive paths and no repeated asset column', async () => {
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'type': 'file',
        'output': 'table',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(api.assetManifests.getForCheckResult).toHaveBeenCalledWith('check-id', 'result-id', {
      type: 'file',
    })
    const firstPath = path.join(tempDir, 'checkly-assets', 'check-result-result-id', '1-assets.zip')
    const secondPath = path.join(tempDir, 'checkly-assets', 'check-result-result-id', '2-assets.zip')
    expect(ctx.logged[0]).toContain('Warning: Selected assets include archive entries.')
    expect(ctx.logged[0]).toContain('filters narrow the manifest list, not the archive bytes')
    expect(ctx.logged[0]).toContain('2 assets processed (2 downloaded)')
    expect(ctx.logged[0]).toContain(firstPath)
    expect(ctx.logged[0]).toContain(secondPath)
    expect(ctx.logged[0]).toContain('TYPE')
    expect(ctx.logged[0]).toContain('PATH')
    expect(ctx.logged[0]).not.toContain('ASSET')
    expect(ctx.logged[0]).not.toContain('STATUS')
  })

  it('shows live progress in interactive human output', async () => {
    const originalIsTTY = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
    vi.mocked(api.api.get).mockResolvedValue({
      data: Readable.from(['downloaded']),
      headers: { 'content-length': '10' },
    } as any)
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'page.png',
        'output': 'table',
        'force': false,
        'skip-existing': false,
      },
    })
    ctx.fancy = true

    try {
      await AssetsDownload.prototype.run.call(ctx as any)
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY })
    }

    expect(ctx.style.actionStart).toHaveBeenCalledWith('Fetching asset manifest')
    expect(ctx.style.actionStatus).toHaveBeenCalledWith(expect.stringContaining('Downloading 1/1 screenshot page.png'))
    expect(ctx.style.actionStatus).toHaveBeenCalledWith(expect.stringContaining('10 B / 10 B'))
    expect(ctx.style.actionSuccess).toHaveBeenCalled()
  })

  it('downloads by glob selector and writes the containing archive for archive entries', async () => {
    const ctx = createCommandContext({
      flags: {
        'test-session-id': 'session-id',
        'result-id': 'result-id',
        'asset': 'traces/*.zip',
        'dir': 'custom-assets',
        'output': 'json',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    const summary = JSON.parse(ctx.logged[0])
    expect(api.assetManifests.getForTestSessionResult).toHaveBeenCalledWith('session-id', 'result-id', {
      name: 'traces/*.zip',
    })
    expect(summary.files).toHaveLength(1)
    expect(summary.files[0].displayType).toBe('archive')
    expect(summary.files[0].path).toBe(path.join(tempDir, 'custom-assets', 'assets.zip'))
    expect(summary.warnings).toEqual([
      'Selected assets include archive entries. Downloading the containing archive file; filters narrow the manifest list, not the archive bytes.',
    ])
  })

  it('downloads a single archive-only manifest without requiring a selector', async () => {
    vi.mocked(api.assetManifests.getForTestSessionResult).mockResolvedValue(archiveOnlyManifest)
    const ctx = createCommandContext({
      flags: {
        'test-session-id': 'session-id',
        'result-id': 'result-id',
        'output': 'json',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    const summary = JSON.parse(ctx.logged[0])
    expect(api.assetManifests.getForTestSessionResult).toHaveBeenCalledWith('session-id', 'result-id')
    expect(axios.get).toHaveBeenCalledWith(
      'https://api.checkly.test/next/assets/check-run-data/eu-central-1/account%2Fsession%2Fresult%2Fassets.zip/redirect',
      expect.objectContaining({ responseType: 'stream' }),
    )
    expect(summary.files).toHaveLength(1)
    expect(summary.files[0].displayType).toBe('archive')
    expect(summary.files[0].path).toBe(path.join(tempDir, 'checkly-assets', 'test-session-result-result-id', 'assets.zip'))
    expect(summary.warnings).toHaveLength(1)
  })

  it('refuses category downloads from truncated manifests', async () => {
    vi.mocked(api.assetManifests.getForCheckResult).mockResolvedValue(truncatedManifest)
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'type': 'file',
        'output': 'table',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(api.assetManifests.getForCheckResult).toHaveBeenCalledWith('check-id', 'result-id', {
      type: 'file',
    })
    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to download assets.',
      expect.objectContaining({
        message: expect.stringContaining('Asset manifest is truncated (5 of 12 entries returned). Refusing to download because the filtered manifest is still incomplete after applying --type file.'),
      }),
    )
    expect(api.api.get).not.toHaveBeenCalled()
    expect(axios.get).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('downloads exact copied Asset values from backend-filtered manifests', async () => {
    vi.mocked(api.assetManifests.getForCheckResult).mockResolvedValue({
      assets: [manifest.assets[1]],
    })
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'traces/checkout trace.zip',
        'output': 'json',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(api.assetManifests.getForCheckResult).toHaveBeenCalledWith('check-id', 'result-id', {
      name: 'traces/checkout trace.zip',
    })
    expect(api.api.get).toHaveBeenCalledWith('/download/trace', { responseType: 'stream' })
    expect(JSON.parse(ctx.logged[0]).files[0].status).toBe('written')
  })

  it('downloads exact plain Asset values from backend-filtered manifests', async () => {
    vi.mocked(api.assetManifests.getForCheckResult).mockResolvedValue({
      assets: [manifest.assets[0]],
    })
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'logs.txt',
        'output': 'json',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(api.assetManifests.getForCheckResult).toHaveBeenCalledWith('check-id', 'result-id', {
      name: 'logs.txt',
    })
    expect(api.api.get).toHaveBeenCalledWith('/download/logs', { responseType: 'stream' })
    expect(JSON.parse(ctx.logged[0]).files[0].status).toBe('written')
  })

  it('fails ambiguous exact asset selection with matching Asset values', async () => {
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'duplicate.txt',
        'output': 'table',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to download assets.',
      expect.objectContaining({
        message: expect.stringContaining('a/duplicate.txt'),
      }),
    )
    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to download assets.',
      expect.objectContaining({
        message: expect.stringContaining('b/duplicate.txt'),
      }),
    )
    expect(process.exitCode).toBe(1)
    expect(api.api.get).not.toHaveBeenCalled()
  })

  it('fails existing files by default', async () => {
    const existingPath = path.join(tempDir, 'checkly-assets', 'check-result-result-id', 'logs.txt')
    await mkdir(path.dirname(existingPath), { recursive: true })
    await writeFile(existingPath, 'existing')
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'logs.txt',
        'output': 'table',
        'force': false,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to download assets.',
      expect.objectContaining({
        message: `Refusing to overwrite existing file. Use --force to overwrite or --skip-existing to keep it.\n${existingPath}`,
      }),
    )
    expect(process.exitCode).toBe(1)
    await expect(readFile(existingPath, 'utf8')).resolves.toBe('existing')
  })

  it('overwrites existing files with --force', async () => {
    const existingPath = path.join(tempDir, 'checkly-assets', 'check-result-result-id', 'logs.txt')
    await mkdir(path.dirname(existingPath), { recursive: true })
    await writeFile(existingPath, 'existing')
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'logs.txt',
        'output': 'json',
        'force': true,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(JSON.parse(ctx.logged[0]).files[0].status).toBe('written')
    await expect(readFile(existingPath, 'utf8')).resolves.toBe('downloaded')
  })

  it('preserves existing files when a forced download fails', async () => {
    const existingPath = path.join(tempDir, 'checkly-assets', 'check-result-result-id', 'logs.txt')
    await mkdir(path.dirname(existingPath), { recursive: true })
    await writeFile(existingPath, 'existing')
    async function* failingDownload () {
      yield 'partial'
      throw new Error('stream failed')
    }
    vi.mocked(api.api.get).mockResolvedValue({ data: Readable.from(failingDownload()) } as any)
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'logs.txt',
        'output': 'table',
        'force': true,
        'skip-existing': false,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to download assets.',
      expect.objectContaining({ message: 'stream failed' }),
    )
    expect(process.exitCode).toBe(1)
    await expect(readFile(existingPath, 'utf8')).resolves.toBe('existing')
    await expect(readdir(path.dirname(existingPath))).resolves.toEqual(['logs.txt'])
  })

  it('skips existing files with --skip-existing', async () => {
    const existingPath = path.join(tempDir, 'checkly-assets', 'check-result-result-id', 'logs.txt')
    await mkdir(path.dirname(existingPath), { recursive: true })
    await writeFile(existingPath, 'existing')
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'logs.txt',
        'output': 'json',
        'force': false,
        'skip-existing': true,
      },
    })

    await AssetsDownload.prototype.run.call(ctx as any)

    expect(JSON.parse(ctx.logged[0]).files[0].status).toBe('skipped')
    expect(api.api.get).not.toHaveBeenCalled()
    await expect(readFile(existingPath, 'utf8')).resolves.toBe('existing')
  })

  it('rejects mutually exclusive overwrite flags', async () => {
    const ctx = createCommandContext({
      flags: {
        'check-id': 'check-id',
        'result-id': 'result-id',
        'asset': 'logs.txt',
        'output': 'table',
        'force': true,
        'skip-existing': true,
      },
    })

    await expect(AssetsDownload.prototype.run.call(ctx as any))
      .rejects
      .toThrow('--force and --skip-existing are mutually exclusive.')
  })

  it('does not expose archive extraction before it is implemented', () => {
    expect(AssetsDownload.flags).not.toHaveProperty('extract')
  })
})
