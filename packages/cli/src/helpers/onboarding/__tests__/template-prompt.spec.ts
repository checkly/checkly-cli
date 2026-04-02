import { describe, expect, it, vi } from 'vitest'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'fs/promises'
import { loadPromptTemplate } from '../template-prompt'

const mockReadFile = vi.mocked(readFile)

describe('loadPromptTemplate', () => {
  it('loads template and replaces a single variable', async () => {
    mockReadFile.mockResolvedValue(
      'Initialize Checkly in this project at {{projectPath}}.\n' as any,
    )

    const result = await loadPromptTemplate('base', { projectPath: '/my/project' })

    expect(result).toBe('Initialize Checkly in this project at /my/project.')
  })

  it('replaces multiple variables (playwright template)', async () => {
    mockReadFile.mockResolvedValue(
      'Project at {{projectPath}} with config at {{playwrightConfigPath}}.\n' as any,
    )

    const result = await loadPromptTemplate('playwright', {
      projectPath: '/my/project',
      playwrightConfigPath: '/my/project/playwright.config.ts',
    })

    expect(result).toBe(
      'Project at /my/project with config at /my/project/playwright.config.ts.',
    )
  })

  it('leaves unknown {{variables}} untouched', async () => {
    mockReadFile.mockResolvedValue('Hello {{name}}, your path is {{projectPath}}.\n' as any)

    const result = await loadPromptTemplate('base', { projectPath: '/my/project' })

    expect(result).toBe('Hello {{name}}, your path is /my/project.')
  })

  it('trims whitespace from the result', async () => {
    mockReadFile.mockResolvedValue('  \n  Some content here.  \n  ' as any)

    const result = await loadPromptTemplate('base', {})

    expect(result).toBe('Some content here.')
  })

  it('throws when the template file does not exist', async () => {
    const error = new Error('ENOENT: no such file or directory')
    mockReadFile.mockRejectedValue(error)

    await expect(loadPromptTemplate('nonexistent', {})).rejects.toThrow(
      'ENOENT: no such file or directory',
    )
  })
})
