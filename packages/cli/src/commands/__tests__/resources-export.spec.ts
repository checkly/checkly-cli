import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

vi.mock('../../rest/api.js', () => ({
  resources: {
    exportCode: vi.fn(),
  },
}))

import * as api from '../../rest/api.js'
import ResourcesExport, {
  parseResourceSpec,
  resolveUpdatedAfter,
} from '../resources/export.js'

function createCommandContext (parsed: unknown) {
  return {
    parse: vi.fn().mockResolvedValue(parsed),
  }
}

describe('resources export', () => {
  let stdout = ''
  let stderr = ''
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let tempDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    process.exitCode = undefined
    stdout = ''
    stderr = ''
    tempDir = await mkdtemp(path.join(tmpdir(), 'checkly-resources-export-'))
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdout += String(chunk)
      return true
    })
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stderr += String(chunk)
      return true
    })
    vi.mocked(api.resources.exportCode).mockResolvedValue({
      files: [{ path: 'resources/api-checks/example.check.ts', content: 'new ApiCheck("example", {})\n' }],
      resources: [{ type: 'check', id: 'check-id', codeManaged: true }],
    })
  })

  afterEach(async () => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
    vi.useRealTimers()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('exports one explicit resource to stdout by default', async () => {
    const ctx = createCommandContext({
      argv: ['check:check-id'],
      flags: {},
    })

    await ResourcesExport.prototype.run.call(ctx as any)

    expect(api.resources.exportCode).toHaveBeenCalledWith({
      resources: [{ type: 'check', id: 'check-id' }],
    })
    expect(stdout).toBe('new ApiCheck("example", {})\n')
    expect(stderr).toBe('')
  })

  it('maps filters and updated-within to the export endpoint', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T12:00:00.000Z'))
    vi.mocked(api.resources.exportCode).mockResolvedValue({
      files: [],
      resources: [],
    })
    const ctx = createCommandContext({
      argv: [],
      flags: {
        'type': ['check'],
        'updated-within': '1h',
        'code-managed-only': true,
        'project': 'mac-project',
        'output-dir': tempDir,
      },
    })

    await ResourcesExport.prototype.run.call(ctx as any)

    expect(api.resources.exportCode).toHaveBeenCalledWith({
      types: ['check'],
      updatedAfter: '2026-07-04T11:00:00.000Z',
      projectLogicalId: 'mac-project',
      codeManagedOnly: true,
    })
    expect(stdout).toBe('')
    expect(stderr).toBe('No files exported.\n')
  })

  it('requires output-dir for filter exports', async () => {
    const ctx = createCommandContext({
      argv: [],
      flags: {
        type: ['check'],
      },
    })

    await expect(ResourcesExport.prototype.run.call(ctx as any))
      .rejects
      .toThrow('Pass --output-dir when exporting multiple resources or using filters.')

    expect(api.resources.exportCode).not.toHaveBeenCalled()
  })

  it('requires output-dir when the backend returns multiple files for stdout export', async () => {
    vi.mocked(api.resources.exportCode).mockResolvedValue({
      files: [
        { path: 'resources/api-checks/example.check.ts', content: 'construct\n' },
        { path: 'resources/api-checks/example.spec.ts', content: 'spec\n' },
      ],
      resources: [{ type: 'check', id: 'check-id', codeManaged: true }],
    })
    const ctx = createCommandContext({
      argv: ['check:check-id'],
      flags: {},
    })

    await expect(ResourcesExport.prototype.run.call(ctx as any))
      .rejects
      .toThrow('Export returned multiple files. Pass --output-dir to write them safely.')

    expect(stdout).toBe('')
  })

  it('writes multiple files to output-dir and warns about unmanaged resources', async () => {
    vi.mocked(api.resources.exportCode).mockResolvedValue({
      files: [
        { path: 'resources/api-checks/example.check.ts', content: 'construct\n' },
        { path: 'resources/api-checks/example.spec.ts', content: 'spec\n' },
      ],
      resources: [{ type: 'check', id: 'check-id', name: 'Example', codeManaged: false }],
    })
    const ctx = createCommandContext({
      argv: ['check:check-id'],
      flags: {
        'output-dir': tempDir,
      },
    })

    await ResourcesExport.prototype.run.call(ctx as any)

    await expect(readFile(path.join(tempDir, 'resources/api-checks/example.check.ts'), 'utf8'))
      .resolves
      .toBe('construct\n')
    await expect(readFile(path.join(tempDir, 'resources/api-checks/example.spec.ts'), 'utf8'))
      .resolves
      .toBe('spec\n')
    expect(stdout).toBe('')
    expect(stderr).toContain('Warning: check:check-id (Example) is not linked to this Monitoring as Code project.')
    expect(stderr).toContain(`Exported 2 files to ${tempDir}`)
  })

  it('does not overwrite output-dir files unless forced', async () => {
    await writeFile(path.join(tempDir, 'example.check.ts'), 'existing\n', 'utf8')
    vi.mocked(api.resources.exportCode).mockResolvedValue({
      files: [{ path: 'example.check.ts', content: 'new\n' }],
      resources: [{ type: 'check', id: 'check-id', codeManaged: true }],
    })
    const ctx = createCommandContext({
      argv: ['check:check-id'],
      flags: {
        'output-dir': tempDir,
      },
    })

    await expect(ResourcesExport.prototype.run.call(ctx as any))
      .rejects
      .toMatchObject({ code: 'EEXIST' })

    await expect(readFile(path.join(tempDir, 'example.check.ts'), 'utf8'))
      .resolves
      .toBe('existing\n')
  })

  it('parses resource specs and validates numeric IDs', () => {
    expect(parseResourceSpec('check:abc')).toEqual({ type: 'check', id: 'abc' })
    expect(parseResourceSpec('alert-channel:123')).toEqual({ type: 'alert-channel', id: 123 })
    expect(() => parseResourceSpec('alert-channel:abc')).toThrow('must be an integer')
    expect(() => parseResourceSpec('unknown:abc')).toThrow('Unsupported resource type')
  })

  it('validates updated timestamps and durations', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T12:00:00.000Z'))

    expect(resolveUpdatedAfter('2026-07-04T10:00:00Z')).toBe('2026-07-04T10:00:00.000Z')
    expect(resolveUpdatedAfter(undefined, '30m')).toBe('2026-07-04T11:30:00.000Z')
    expect(() => resolveUpdatedAfter('not-a-date')).toThrow('Invalid --updated-after')
    expect(() => resolveUpdatedAfter(undefined, '1hour')).toThrow('Invalid --updated-within')
  })
})
