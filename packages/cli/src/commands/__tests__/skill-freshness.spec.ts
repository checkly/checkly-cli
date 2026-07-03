import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join, relative } from 'path'

vi.mock('../../services/skills', () => ({
  findStaleSkills: vi.fn(),
}))

import { findStaleSkills } from '../../services/skills.js'
import { BaseCommand } from '../baseCommand.js'

const mockFindStaleSkills = vi.mocked(findStaleSkills)

describe('BaseCommand.checkSkillFreshness', () => {
  let warnings: Array<{ title: string, message: string }>
  let ctx: { id: string | undefined, style: { longWarning: (title: string, message: string) => void } }

  function run (id: string | undefined): Promise<void> {
    ctx.id = id
    // ctx is a minimal stand-in for BaseCommand, exposing only what
    // checkSkillFreshness touches (id + style). Cast through unknown rather
    // than any so the structural mismatch stays explicit and localized.
    return BaseCommand.prototype.checkSkillFreshness.call(ctx as unknown as BaseCommand)
  }

  beforeEach(() => {
    vi.resetAllMocks()
    warnings = []
    ctx = {
      id: undefined,
      style: {
        longWarning: (title, message) => warnings.push({ title, message }),
      },
    }
  })

  it('warns when an installed skill is stale', async () => {
    const targetPath = join(process.cwd(), '.claude/skills/checkly/SKILL.md')
    mockFindStaleSkills.mockResolvedValue([
      { dir: '.claude/skills/checkly', targetPath },
    ])

    await run('test')

    expect(warnings).toHaveLength(1)
    expect(warnings[0].title).toBe('Checkly skill is out of date')
    expect(warnings[0].message).toContain(relative(process.cwd(), targetPath))
    expect(warnings[0].message).toContain(
      'npx checkly skills install --path .claude/skills/checkly --force',
    )
    expect(warnings[0].message).toContain(
      'https://github.com/checkly/checkly-cli/issues',
    )
  })

  it('pairs each stale path with its own update command in one warning', async () => {
    const claudePath = join(process.cwd(), '.claude/skills/checkly/SKILL.md')
    const cursorPath = join(process.cwd(), '.cursor/skills/checkly/SKILL.md')
    mockFindStaleSkills.mockResolvedValue([
      { dir: '.claude/skills/checkly', targetPath: claudePath },
      { dir: '.cursor/skills/checkly', targetPath: cursorPath },
    ])

    await run('deploy')

    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain(
      `${relative(process.cwd(), claudePath)}\n  npx checkly skills install --path .claude/skills/checkly --force`,
    )
    expect(warnings[0].message).toContain(
      `${relative(process.cwd(), cursorPath)}\n  npx checkly skills install --path .cursor/skills/checkly --force`,
    )
  })

  it('does not warn when no skills are stale', async () => {
    mockFindStaleSkills.mockResolvedValue([])

    await run('test')

    expect(warnings).toHaveLength(0)
  })

  it('skips the check for the init command', async () => {
    await run('init')

    expect(mockFindStaleSkills).not.toHaveBeenCalled()
    expect(warnings).toHaveLength(0)
  })

  it('skips the check for skills commands', async () => {
    await run('skills:install')

    expect(mockFindStaleSkills).not.toHaveBeenCalled()
    expect(warnings).toHaveLength(0)
  })

  it('never throws if the staleness check fails', async () => {
    mockFindStaleSkills.mockRejectedValue(new Error('boom'))

    await expect(run('test')).resolves.toBeUndefined()
    expect(warnings).toHaveLength(0)
  })
})
