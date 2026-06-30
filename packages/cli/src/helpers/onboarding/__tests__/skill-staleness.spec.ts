import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../../commands/skills/install', () => ({
  PLATFORM_TARGETS: {
    claude: '.claude/skills/checkly',
    cursor: '.cursor/skills/checkly',
    codex: '.agents/skills/checkly',
  },
  readSkillFile: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'fs/promises'
import { join } from 'path'
import { readSkillFile } from '../../../commands/skills/install.js'
import { findStaleSkills } from '../skill-staleness.js'

const mockReadFile = vi.mocked(readFile)
const mockReadSkillFile = vi.mocked(readSkillFile)

const BUNDLED = '# Checkly Skill v2'

describe('findStaleSkills', () => {
  const projectDir = '/some/project'

  // Maps a set of installed SKILL.md paths to their on-disk content.
  function setupInstalled (files: Record<string, string>): void {
    mockReadFile.mockImplementation(p => {
      const content = files[p as string]
      if (content === undefined) {
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      }
      return Promise.resolve(content)
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    mockReadSkillFile.mockResolvedValue(BUNDLED)
  })

  it('returns empty when no skill is installed anywhere', async () => {
    setupInstalled({})
    expect(await findStaleSkills(projectDir)).toEqual([])
  })

  it('returns empty when the installed skill matches the bundled skill', async () => {
    setupInstalled({
      [join(projectDir, '.claude/skills/checkly/SKILL.md')]: BUNDLED,
    })
    expect(await findStaleSkills(projectDir)).toEqual([])
  })

  it('flags an installed skill whose content differs from the bundled skill', async () => {
    setupInstalled({
      [join(projectDir, '.claude/skills/checkly/SKILL.md')]: '# Checkly Skill v1',
    })

    expect(await findStaleSkills(projectDir)).toEqual([
      {
        dir: '.claude/skills/checkly',
        targetPath: join(projectDir, '.claude/skills/checkly/SKILL.md'),
      },
    ])
  })

  it('flags every stale directory and skips matching ones', async () => {
    setupInstalled({
      [join(projectDir, '.claude/skills/checkly/SKILL.md')]: '# stale',
      [join(projectDir, '.cursor/skills/checkly/SKILL.md')]: BUNDLED,
      [join(projectDir, '.agents/skills/checkly/SKILL.md')]: '# also stale',
    })

    const stale = await findStaleSkills(projectDir)

    expect(stale).toEqual([
      {
        dir: '.claude/skills/checkly',
        targetPath: join(projectDir, '.claude/skills/checkly/SKILL.md'),
      },
      {
        dir: '.agents/skills/checkly',
        targetPath: join(projectDir, '.agents/skills/checkly/SKILL.md'),
      },
    ])
  })

  it('deduplicates directories shared by multiple platforms', async () => {
    // codex maps to .agents/skills/checkly; ensure it is only checked once.
    setupInstalled({
      [join(projectDir, '.agents/skills/checkly/SKILL.md')]: '# stale',
    })

    const stale = await findStaleSkills(projectDir)

    expect(stale).toHaveLength(1)
    expect(stale[0].dir).toBe('.agents/skills/checkly')
  })

  it('returns empty when the bundled skill cannot be read', async () => {
    mockReadSkillFile.mockRejectedValue(new Error('missing bundle'))
    setupInstalled({
      [join(projectDir, '.claude/skills/checkly/SKILL.md')]: '# whatever',
    })

    expect(await findStaleSkills(projectDir)).toEqual([])
  })
})
