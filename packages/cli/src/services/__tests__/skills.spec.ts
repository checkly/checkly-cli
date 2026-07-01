import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}))

import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  PLATFORM_TARGETS,
  SKILL_FILE_PATH,
  readSkillFile,
  writeSkillToTarget,
  findStaleSkills,
  findInstalledSkills,
} from '../skills.js'

const mockReadFile = vi.mocked(readFile)
const mockWriteFile = vi.mocked(writeFile)
const mockMkdir = vi.mocked(mkdir)
const mockExistsSync = vi.mocked(existsSync)

const SKILL_CONTENT = '# Test Skill Content\nThis is a test skill.'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PLATFORM_TARGETS', () => {
  it('has expected platform keys', () => {
    expect(PLATFORM_TARGETS).toHaveProperty('claude')
    expect(PLATFORM_TARGETS).toHaveProperty('cursor')
    expect(PLATFORM_TARGETS).toHaveProperty('windsurf')
    expect(PLATFORM_TARGETS).toHaveProperty('github-copilot')
    expect(PLATFORM_TARGETS).toHaveProperty('goose')
    expect(PLATFORM_TARGETS).toHaveProperty('codex')
    expect(PLATFORM_TARGETS).toHaveProperty('gemini-cli')
  })
})

describe('readSkillFile()', () => {
  it('reads from the correct path and returns content', async () => {
    mockReadFile.mockResolvedValue(SKILL_CONTENT)

    const result = await readSkillFile()

    expect(readFile).toHaveBeenCalledWith(SKILL_FILE_PATH, 'utf8')
    expect(result).toBe(SKILL_CONTENT)
  })

  it('throws on read failure', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    await expect(readSkillFile()).rejects.toThrow('Failed to read skill file')
  })
})

describe('writeSkillToTarget()', () => {
  beforeEach(() => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
  })

  it('creates directory and writes file, returns path', async () => {
    const result = await writeSkillToTarget('some/dir', 'content')

    const expectedDir = join(process.cwd(), 'some/dir')
    expect(mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true })
    expect(writeFile).toHaveBeenCalledWith(
      join(expectedDir, 'SKILL.md'),
      'content',
      'utf8',
    )
    expect(result).toBe(join(expectedDir, 'SKILL.md'))
  })

  it('throws on mkdir failure', async () => {
    mockMkdir.mockRejectedValue(new Error('EACCES'))

    await expect(writeSkillToTarget('some/dir', 'content')).rejects.toThrow('Failed to create directory')
  })

  it('throws on writeFile failure', async () => {
    mockWriteFile.mockRejectedValue(new Error('EACCES'))

    await expect(writeSkillToTarget('some/dir', 'content')).rejects.toThrow('Failed to write skill file')
  })
})

describe('findStaleSkills', () => {
  const projectDir = '/some/project'
  const BUNDLED = '# Checkly Skill v2'

  // Mocks readFile so SKILL_FILE_PATH returns the bundled skill and each
  // installed path returns its mapped content (ENOENT when absent).
  function setup ({ bundled = BUNDLED, installed = {} }: {
    bundled?: string | null
    installed?: Record<string, string>
  }): void {
    mockReadFile.mockImplementation(p => {
      if (p === SKILL_FILE_PATH) {
        return bundled === null
          ? Promise.reject(new Error('missing bundle'))
          : Promise.resolve(bundled)
      }
      const content = installed[p as string]
      return content === undefined
        ? Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
        : Promise.resolve(content)
    })
  }

  it('returns empty when no skill is installed anywhere', async () => {
    setup({ installed: {} })
    expect(await findStaleSkills(projectDir)).toEqual([])
  })

  it('returns empty when the installed skill matches the bundled skill', async () => {
    setup({
      installed: { [join(projectDir, '.claude/skills/checkly/SKILL.md')]: BUNDLED },
    })
    expect(await findStaleSkills(projectDir)).toEqual([])
  })

  it('flags an installed skill whose content differs from the bundled skill', async () => {
    setup({
      installed: { [join(projectDir, '.claude/skills/checkly/SKILL.md')]: '# Checkly Skill v1' },
    })

    expect(await findStaleSkills(projectDir)).toEqual([
      {
        dir: '.claude/skills/checkly',
        targetPath: join(projectDir, '.claude/skills/checkly/SKILL.md'),
      },
    ])
  })

  it('flags every stale directory and skips matching ones', async () => {
    setup({
      installed: {
        [join(projectDir, '.claude/skills/checkly/SKILL.md')]: '# stale',
        [join(projectDir, '.cursor/skills/checkly/SKILL.md')]: BUNDLED,
        [join(projectDir, '.goose/skills/checkly/SKILL.md')]: '# also stale',
      },
    })

    const stale = await findStaleSkills(projectDir)

    expect(stale).toHaveLength(2)
    expect(stale).toContainEqual({
      dir: '.claude/skills/checkly',
      targetPath: join(projectDir, '.claude/skills/checkly/SKILL.md'),
    })
    expect(stale).toContainEqual({
      dir: '.goose/skills/checkly',
      targetPath: join(projectDir, '.goose/skills/checkly/SKILL.md'),
    })
    expect(stale).not.toContainEqual(
      expect.objectContaining({ dir: '.cursor/skills/checkly' }),
    )
  })

  it('deduplicates directories shared by multiple platforms', async () => {
    // amp, cline, codex, gemini-cli, etc. all map to .agents/skills/checkly.
    setup({
      installed: { [join(projectDir, '.agents/skills/checkly/SKILL.md')]: '# stale' },
    })

    const stale = await findStaleSkills(projectDir)

    expect(stale).toHaveLength(1)
    expect(stale[0].dir).toBe('.agents/skills/checkly')
  })

  it('returns empty when the bundled skill cannot be read', async () => {
    setup({
      bundled: null,
      installed: { [join(projectDir, '.claude/skills/checkly/SKILL.md')]: '# whatever' },
    })

    expect(await findStaleSkills(projectDir)).toEqual([])
  })
})

describe('findInstalledSkills', () => {
  const projectDir = '/some/project'

  function setupExists (existingPaths: string[]): void {
    mockExistsSync.mockImplementation(p => existingPaths.includes(p as string))
  }

  it('returns empty when no skill is installed anywhere', () => {
    setupExists([])
    expect(findInstalledSkills(projectDir)).toEqual([])
  })

  it('returns the path of a single installed skill', () => {
    const claude = join(projectDir, '.claude/skills/checkly/SKILL.md')
    setupExists([claude])
    expect(findInstalledSkills(projectDir)).toEqual([claude])
  })

  it('returns every installed skill path', () => {
    const claude = join(projectDir, '.claude/skills/checkly/SKILL.md')
    const continueDir = join(projectDir, '.continue/skills/checkly/SKILL.md')
    setupExists([claude, continueDir])

    const installed = findInstalledSkills(projectDir)

    expect(installed).toContain(claude)
    expect(installed).toContain(continueDir)
    expect(installed).toHaveLength(2)
  })

  it('deduplicates directories shared by multiple platforms', () => {
    const agents = join(projectDir, '.agents/skills/checkly/SKILL.md')
    setupExists([agents])

    const installed = findInstalledSkills(projectDir)

    expect(installed).toEqual([agents])
  })
})
