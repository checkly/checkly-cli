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

import { existsSync, readFileSync, writeFileSync, cpSync } from 'fs'
import { execSync } from 'child_process'
import prompts from 'prompts'
import { join } from 'path'
import { runBoilerplateSetup } from '../boilerplate'

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockWriteFileSync = vi.mocked(writeFileSync)
const mockCpSync = vi.mocked(cpSync)
const mockExecSync = vi.mocked(execSync)
const mockPrompts = vi.mocked(prompts)

const projectDir = '/test/project'
const configTemplate = `projectName: '{{projectName}}', logicalId: '{{logicalId}}'`
const packageJson = JSON.stringify({ name: 'my-cool-app', devDependencies: {} })

describe('runBoilerplateSetup', () => {
  let logs: string[]
  const log = (msg: string) => logs.push(msg)

  beforeEach(() => {
    vi.clearAllMocks()
    logs = []
    delete process.env.npm_config_user_agent

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

  it('creates checkly.config.ts with project name and logicalId replaced', async () => {
    await runBoilerplateSetup(projectDir, log)

    const writeCall = mockWriteFileSync.mock.calls.find(
      ([path]) => path.toString().endsWith('checkly.config.ts'),
    )
    expect(writeCall).toBeDefined()
    const content = writeCall![1] as string
    expect(content).toContain('projectName: \'my-cool-app\'')
    expect(content).toContain('logicalId: \'my-cool-app\'')
    expect(content).not.toContain('{{projectName}}')
    expect(content).not.toContain('{{logicalId}}')
  })

  it('sanitizes logicalId by replacing non-alphanumeric chars with hyphens', async () => {
    mockReadFileSync.mockImplementation(path => {
      const p = path.toString()
      if (p.includes('checkly-config-template')) return configTemplate
      if (p.endsWith('package.json')) return JSON.stringify({ name: '@scope/my app!', devDependencies: {} })
      return ''
    })

    await runBoilerplateSetup(projectDir, log)

    const writeCall = mockWriteFileSync.mock.calls.find(
      ([path]) => path.toString().endsWith('checkly.config.ts'),
    )
    const content = writeCall![1] as string
    expect(content).toContain('logicalId: \'-scope-my-app-\'')
  })

  it('copies __checks__ directory', async () => {
    await runBoilerplateSetup(projectDir, log)

    expect(mockCpSync).toHaveBeenCalledWith(
      expect.stringContaining('__checks__'),
      join(projectDir, '__checks__'),
      { recursive: true },
    )
    expect(logs.some(l => l.includes('__checks__'))).toBe(true)
  })

  it('skips config if checkly.config.ts already exists', async () => {
    mockExistsSync.mockImplementation(path => {
      const p = path.toString()
      if (p.endsWith('checkly.config.ts')) return true
      if (p.endsWith('package.json')) return true
      return false
    })

    await runBoilerplateSetup(projectDir, log)

    const configWrite = mockWriteFileSync.mock.calls.find(
      ([path]) => path.toString().endsWith('checkly.config.ts'),
    )
    expect(configWrite).toBeUndefined()
    expect(logs.some(l => l.includes('already exists') && l.includes('checkly.config.ts'))).toBe(true)
  })

  it('skips __checks__ if directory already exists', async () => {
    mockExistsSync.mockImplementation(path => {
      const p = path.toString()
      if (p.endsWith('__checks__')) return true
      if (p.endsWith('package.json')) return true
      return false
    })

    await runBoilerplateSetup(projectDir, log)

    expect(mockCpSync).not.toHaveBeenCalled()
    expect(logs.some(l => l.includes('already exists') && l.includes('__checks__'))).toBe(true)
  })

  it('shows exact install command with detected PM name', async () => {
    process.env.npm_config_user_agent = 'pnpm/8.0.0'
    mockPrompts.mockResolvedValue({ install: false })

    await runBoilerplateSetup(projectDir, log)

    expect(logs.some(l => l.includes('pnpm'))).toBe(true)
  })

  it('shows explicit instructions when deps declined', async () => {
    mockPrompts.mockResolvedValue({ install: false })

    await runBoilerplateSetup(projectDir, log)

    expect(logs.some(l => l.includes('npm install'))).toBe(true)
  })

  it('configOnly: true skips __checks__ copy', async () => {
    await runBoilerplateSetup(projectDir, log, { configOnly: true })

    expect(mockCpSync).not.toHaveBeenCalled()
  })

  it('skipPrompts: true installs deps without asking', async () => {
    await runBoilerplateSetup(projectDir, log, { skipPrompts: true })

    expect(mockPrompts).not.toHaveBeenCalled()
    expect(mockExecSync).toHaveBeenCalledWith('npm install', { cwd: projectDir, stdio: 'pipe' })
    expect(logs.some(l => l.includes('Installed dependencies'))).toBe(true)
  })

  it('handles install failure gracefully', async () => {
    mockPrompts.mockResolvedValue({ install: true })
    mockExecSync.mockImplementation(() => {
      throw new Error('install failed')
    })

    await runBoilerplateSetup(projectDir, log)

    expect(logs.some(l => l.includes('Failed to install'))).toBe(true)
    expect(logs.some(l => l.includes('npm install'))).toBe(true)
  })

  it('detects yarn from npm_config_user_agent', async () => {
    process.env.npm_config_user_agent = 'yarn/1.22.0'
    mockPrompts.mockResolvedValue({ install: false })

    await runBoilerplateSetup(projectDir, log)

    expect(logs.some(l => l.includes('yarn'))).toBe(true)
  })

  it('detects bun from npm_config_user_agent', async () => {
    process.env.npm_config_user_agent = 'bun/1.0.0'
    mockPrompts.mockResolvedValue({ install: false })

    await runBoilerplateSetup(projectDir, log)

    expect(logs.some(l => l.includes('bun'))).toBe(true)
  })

  it('adds checkly and jiti as devDependencies before installing', async () => {
    mockPrompts.mockResolvedValue({ install: true })

    await runBoilerplateSetup(projectDir, log)

    const pkgWrite = mockWriteFileSync.mock.calls.find(
      ([path]) => path.toString().endsWith('package.json'),
    )
    expect(pkgWrite).toBeDefined()
    const written = JSON.parse(pkgWrite![1] as string)
    expect(written.devDependencies.checkly).toBe('latest')
    expect(written.devDependencies.jiti).toBe('latest')
  })
})
