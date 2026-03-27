import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  cpSync: vi.fn(),
}))

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('prompts', () => ({
  default: vi.fn(),
}))

vi.mock('../../../services/check-parser/package-files/package-manager', () => ({
  detectPackageManager: vi.fn().mockResolvedValue({
    name: 'npm',
    installCommand: () => ({ executable: 'npm', args: ['install'], unsafeDisplayCommand: 'npm install' }),
  }),
}))

vi.mock('../prompts-helpers', () => ({
  makeOnCancel: vi.fn(() => vi.fn()),
  successMessage: vi.fn((msg: string) => `OK ${msg}`),
}))

import { existsSync, readFileSync, writeFileSync, cpSync } from 'fs'
import { execSync } from 'child_process'
import prompts from 'prompts'
import { join } from 'path'
import { detectPackageManager } from '../../../services/check-parser/package-files/package-manager'
import {
  createConfig,
  copyChecks,
  runDepsInstall,
} from '../boilerplate'

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockWriteFileSync = vi.mocked(writeFileSync)
const mockCpSync = vi.mocked(cpSync)
const mockExecSync = vi.mocked(execSync)
const mockPrompts = vi.mocked(prompts)

const projectDir = '/test/project'
const configTemplate = `projectName: '{{projectName}}', logicalId: '{{logicalId}}'`
const packageJson = JSON.stringify({ name: 'my-cool-app', devDependencies: {} })

describe('boilerplate', () => {
  let logs: string[]
  const log = (msg: string) => logs.push(msg)

  beforeEach(() => {
    vi.clearAllMocks()
    logs = []
    delete process.env.npm_config_user_agent

    // Default PM detection returns npm
    vi.mocked(detectPackageManager).mockResolvedValue({
      name: 'npm',
      installCommand: () => ({ executable: 'npm', args: ['install'], unsafeDisplayCommand: 'npm install' }),
    } as any)

    // Default: config template readable, package.json exists
    mockReadFileSync.mockImplementation(path => {
      const p = path.toString()
      if (p.includes('checkly-config-template')) return configTemplate
      if (p.endsWith('package.json')) return packageJson
      return ''
    })
    mockExistsSync.mockImplementation(path => {
      const p = path.toString()
      if (p.endsWith('package.json')) return true
      return false
    })
    mockPrompts.mockResolvedValue({ install: false })
  })

  describe('createConfig', () => {
    it('creates checkly.config.ts with project name and logicalId replaced', () => {
      const result = createConfig(projectDir, log)

      const writeCall = mockWriteFileSync.mock.calls.find(
        ([path]) => path.toString().endsWith('checkly.config.ts'),
      )
      expect(result).toEqual({ ok: true, created: true })
      expect(writeCall).toBeDefined()
      const content = writeCall![1] as string
      expect(content).toContain('projectName: \'my-cool-app\'')
      expect(content).toContain('logicalId: \'my-cool-app\'')
      expect(content).not.toContain('{{projectName}}')
      expect(content).not.toContain('{{logicalId}}')
    })

    it('sanitizes logicalId by replacing non-alphanumeric chars with hyphens', () => {
      mockReadFileSync.mockImplementation(path => {
        const p = path.toString()
        if (p.includes('checkly-config-template')) return configTemplate
        if (p.endsWith('package.json')) return JSON.stringify({ name: '@scope/my app!', devDependencies: {} })
        return ''
      })

      createConfig(projectDir, log)

      const writeCall = mockWriteFileSync.mock.calls.find(
        ([path]) => path.toString().endsWith('checkly.config.ts'),
      )
      const content = writeCall![1] as string
      expect(content).toContain('logicalId: \'scope-my-app\'')
    })

    it('skips config if checkly.config.ts already exists', () => {
      mockExistsSync.mockImplementation(path => {
        const p = path.toString()
        if (p.endsWith('checkly.config.ts')) return true
        if (p.endsWith('package.json')) return true
        return false
      })

      const result = createConfig(projectDir, log)

      const configWrite = mockWriteFileSync.mock.calls.find(
        ([path]) => path.toString().endsWith('checkly.config.ts'),
      )
      expect(result).toEqual({ ok: true, created: false })
      expect(configWrite).toBeUndefined()
      expect(logs.some(l => l.includes('already exists') && l.includes('checkly.config.ts'))).toBe(true)
    })

    it('returns not ok if the template cannot be read', () => {
      mockReadFileSync.mockImplementation(path => {
        const p = path.toString()
        if (p.includes('checkly-config-template')) {
          throw new Error('ENOENT')
        }
        if (p.endsWith('package.json')) return packageJson
        return ''
      })

      const result = createConfig(projectDir, log)

      expect(result).toEqual({ ok: false, created: false })
      expect(logs.some(l => l.includes('Could not read config template'))).toBe(true)
    })
  })

  describe('copyChecks', () => {
    it('copies __checks__ directory', () => {
      copyChecks(projectDir, log)

      expect(mockCpSync).toHaveBeenCalledWith(
        expect.stringContaining('__checks__'),
        join(projectDir, '__checks__'),
        { recursive: true },
      )
      expect(logs.some(l => l.includes('__checks__'))).toBe(true)
    })

    it('skips __checks__ if directory already exists', () => {
      mockExistsSync.mockImplementation(path => {
        const p = path.toString()
        if (p.endsWith('__checks__')) return true
        if (p.endsWith('package.json')) return true
        return false
      })

      copyChecks(projectDir, log)

      expect(mockCpSync).not.toHaveBeenCalled()
      expect(logs.some(l => l.includes('already exists') && l.includes('__checks__'))).toBe(true)
    })
  })

  describe('runDepsInstall', () => {
    it('shows exact install command with detected PM name', async () => {
      vi.mocked(detectPackageManager).mockResolvedValue({
        name: 'pnpm',
        installCommand: () => ({ executable: 'pnpm', args: ['install'], unsafeDisplayCommand: 'pnpm install' }),
      } as any)
      mockPrompts.mockResolvedValue({ install: false })

      await runDepsInstall(projectDir, log)

      expect(logs.some(l => l.includes('pnpm'))).toBe(true)
    })

    it('shows explicit instructions when deps declined', async () => {
      mockPrompts.mockResolvedValue({ install: false })

      await runDepsInstall(projectDir, log)

      expect(logs.some(l => l.includes('npm install'))).toBe(true)
    })

    it('skipPrompts: true installs deps without asking', async () => {
      const result = await runDepsInstall(projectDir, log, { skipPrompts: true })

      expect(result).toEqual({
        ok: true,
        packageJsonUpdated: true,
        installed: true,
      })
      expect(mockPrompts).not.toHaveBeenCalled()
      expect(mockExecSync).toHaveBeenCalledWith('npm install', { cwd: projectDir, stdio: 'pipe' })
      expect(logs.some(l => l.includes('Installed dependencies'))).toBe(true)
    })

    it('handles install failure gracefully', async () => {
      mockPrompts.mockResolvedValue({ install: true })
      mockExecSync.mockImplementation(() => {
        throw new Error('install failed')
      })

      const result = await runDepsInstall(projectDir, log)

      expect(result).toEqual({
        ok: false,
        packageJsonUpdated: true,
        installed: false,
      })
      expect(logs.some(l => l.includes('Failed to install'))).toBe(true)
      expect(logs.some(l => l.includes('npm install'))).toBe(true)
    })

    it('detects yarn via detectPackageManager', async () => {
      vi.mocked(detectPackageManager).mockResolvedValue({
        name: 'yarn',
        installCommand: () => ({ executable: 'yarn', args: ['install'], unsafeDisplayCommand: 'yarn install' }),
      } as any)
      mockPrompts.mockResolvedValue({ install: false })

      await runDepsInstall(projectDir, log)

      expect(logs.some(l => l.includes('yarn'))).toBe(true)
    })

    it('detects bun via detectPackageManager', async () => {
      vi.mocked(detectPackageManager).mockResolvedValue({
        name: 'bun',
        installCommand: () => ({ executable: 'bun', args: ['install'], unsafeDisplayCommand: 'bun install' }),
      } as any)
      mockPrompts.mockResolvedValue({ install: false })

      await runDepsInstall(projectDir, log)

      expect(logs.some(l => l.includes('bun'))).toBe(true)
    })

    it('adds checkly and jiti as devDependencies before installing', async () => {
      mockPrompts.mockResolvedValue({ install: true })

      await runDepsInstall(projectDir, log)

      const pkgWrite = mockWriteFileSync.mock.calls.find(
        ([path]) => path.toString().endsWith('package.json'),
      )
      expect(pkgWrite).toBeDefined()
      const written = JSON.parse(pkgWrite![1] as string)
      expect(written.devDependencies.checkly).toBe('latest')
      expect(written.devDependencies.jiti).toBe('latest')
    })
  })
})
