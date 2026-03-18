import { describe, expect, it, vi } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}))

import { existsSync } from 'fs'
import { join } from 'path'
import { detectProjectContext } from '../detect-project'

const mockExistsSync = vi.mocked(existsSync)

describe('detectProjectContext', () => {
  const projectDir = '/some/project'

  function setupExists (existingPaths: string[]) {
    mockExistsSync.mockImplementation(p => existingPaths.includes(p as string))
  }

  it('detects existing project when package.json exists', () => {
    setupExists([join(projectDir, 'package.json')])
    const ctx = detectProjectContext(projectDir)
    expect(ctx.isExistingProject).toBe(true)
  })

  it('returns false for isExistingProject when no package.json', () => {
    setupExists([])
    const ctx = detectProjectContext(projectDir)
    expect(ctx.isExistingProject).toBe(false)
  })

  it('detects playwright.config.ts when present', () => {
    const configPath = join(projectDir, 'playwright.config.ts')
    setupExists([configPath])
    const ctx = detectProjectContext(projectDir)
    expect(ctx.hasPlaywrightConfig).toBe(true)
    expect(ctx.playwrightConfigPath).toBe(configPath)
  })

  it('detects playwright.config.js when .ts not present', () => {
    const configPath = join(projectDir, 'playwright.config.js')
    setupExists([configPath])
    const ctx = detectProjectContext(projectDir)
    expect(ctx.hasPlaywrightConfig).toBe(true)
    expect(ctx.playwrightConfigPath).toBe(configPath)
  })

  it('returns null playwrightConfigPath when no playwright config found', () => {
    setupExists([])
    const ctx = detectProjectContext(projectDir)
    expect(ctx.hasPlaywrightConfig).toBe(false)
    expect(ctx.playwrightConfigPath).toBeNull()
  })

  it('prefers playwright.config.ts over playwright.config.js', () => {
    const tsPath = join(projectDir, 'playwright.config.ts')
    const jsPath = join(projectDir, 'playwright.config.js')
    setupExists([tsPath, jsPath])
    const ctx = detectProjectContext(projectDir)
    expect(ctx.playwrightConfigPath).toBe(tsPath)
  })

  it('detects existing checkly config', () => {
    setupExists([join(projectDir, 'checkly.config.ts')])
    const ctx = detectProjectContext(projectDir)
    expect(ctx.hasChecklyConfig).toBe(true)
  })

  it('returns false for hasChecklyConfig when no checkly config found', () => {
    setupExists([])
    const ctx = detectProjectContext(projectDir)
    expect(ctx.hasChecklyConfig).toBe(false)
  })

  it('detects existing __checks__ directory', () => {
    setupExists([join(projectDir, '__checks__')])
    const ctx = detectProjectContext(projectDir)
    expect(ctx.hasChecksDir).toBe(true)
  })

  it('returns false for hasChecksDir when __checks__ does not exist', () => {
    setupExists([])
    const ctx = detectProjectContext(projectDir)
    expect(ctx.hasChecksDir).toBe(false)
  })
})
