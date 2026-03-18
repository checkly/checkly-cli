import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}))

vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({})),
}))

vi.mock('../../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'interactive'),
}))

import { access, mkdir, readFile, writeFile } from 'fs/promises'
import prompts from 'prompts'
import { detectCliMode } from '../../../helpers/cli-mode'
import SkillsInstall, { PLATFORM_TARGETS, readSkillFile, SKILL_FILE_PATH, writeSkillToTarget } from '../install'

const SKILL_CONTENT = '# Test Skill Content\nThis is a test skill.'

const mockConfig = {
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand (...args: string[]) {
  const cmd = new SkillsInstall(args, mockConfig)
  cmd.log = vi.fn() as any
  return cmd
}

function getLogged (cmd: SkillsInstall): string[] {
  return (cmd.log as ReturnType<typeof vi.fn>).mock.calls.map(
    (call: string[]) => call[0],
  )
}

describe('skills install', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readFile).mockResolvedValue(SKILL_CONTENT)
    vi.mocked(writeFile).mockResolvedValue(undefined)
    vi.mocked(mkdir).mockResolvedValue(undefined)
    // File does not exist by default
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(detectCliMode).mockReturnValue('interactive')
  })

  describe('--target flag', () => {
    it('installs to claude target', async () => {
      const cmd = createCommand('--target', 'claude', '--force')

      await cmd.run()

      const expectedDir = join(process.cwd(), '.claude/skills/checkly')
      expect(mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(
        join(expectedDir, 'SKILL.md'),
        SKILL_CONTENT,
        'utf8',
      )
      expect(getLogged(cmd).some(m => m.includes('Installed Checkly agent skill to:'))).toBe(true)
    })

    it('installs to cursor target', async () => {
      const cmd = createCommand('--target', 'cursor', '--force')

      await cmd.run()

      const expectedDir = join(process.cwd(), '.cursor/skills/checkly')
      expect(writeFile).toHaveBeenCalledWith(
        join(expectedDir, 'SKILL.md'),
        SKILL_CONTENT,
        'utf8',
      )
    })

    it('installs to windsurf target', async () => {
      const cmd = createCommand('--target', 'windsurf', '--force')

      await cmd.run()

      const expectedDir = join(process.cwd(), '.windsurf/skills/checkly')
      expect(writeFile).toHaveBeenCalledWith(
        join(expectedDir, 'SKILL.md'),
        SKILL_CONTENT,
        'utf8',
      )
    })

    it('installs to github-copilot target', async () => {
      const cmd = createCommand('--target', 'github-copilot', '--force')

      await cmd.run()

      const expectedDir = join(process.cwd(), '.agents/skills/checkly')
      expect(writeFile).toHaveBeenCalledWith(
        join(expectedDir, 'SKILL.md'),
        SKILL_CONTENT,
        'utf8',
      )
    })

    it('installs to goose target', async () => {
      const cmd = createCommand('--target', 'goose', '--force')

      await cmd.run()

      const expectedDir = join(process.cwd(), '.goose/skills/checkly')
      expect(writeFile).toHaveBeenCalledWith(
        join(expectedDir, 'SKILL.md'),
        SKILL_CONTENT,
        'utf8',
      )
    })

    it('installs to continue target', async () => {
      const cmd = createCommand('--target', 'continue', '--force')

      await cmd.run()

      const expectedDir = join(process.cwd(), '.continue/skills/checkly')
      expect(writeFile).toHaveBeenCalledWith(
        join(expectedDir, 'SKILL.md'),
        SKILL_CONTENT,
        'utf8',
      )
    })

    it('errors on unknown target', async () => {
      const cmd = createCommand('--target', 'unknown', '--force')

      await expect(cmd.run()).rejects.toThrow('Unknown target "unknown"')
    })
  })

  describe('--path flag', () => {
    it('installs to custom directory', async () => {
      const cmd = createCommand('--path', 'custom/dir', '--force')

      await cmd.run()

      const expectedDir = join(process.cwd(), 'custom/dir')
      expect(mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(
        join(expectedDir, 'SKILL.md'),
        SKILL_CONTENT,
        'utf8',
      )
    })
  })

  describe('error paths', () => {
    it('errors when skill source file cannot be read', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
      const cmd = createCommand('--target', 'claude', '--force')

      await expect(cmd.run()).rejects.toThrow('Failed to read skill file')
    })

    it('errors when target directory cannot be created', async () => {
      vi.mocked(mkdir).mockRejectedValue(new Error('EACCES'))
      const cmd = createCommand('--target', 'claude', '--force')

      await expect(cmd.run()).rejects.toThrow('Failed to create directory')
    })

    it('errors when skill file cannot be written', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('EACCES'))
      const cmd = createCommand('--target', 'claude', '--force')

      await expect(cmd.run()).rejects.toThrow('Failed to write skill file')
    })
  })

  describe('flag exclusivity', () => {
    it('errors when both --target and --path are provided', async () => {
      const cmd = createCommand('--target', 'claude', '--path', 'custom/dir')

      await expect(cmd.run()).rejects.toThrow(/cannot also be provided when using/)
    })
  })

  describe('overwrite confirmation', () => {
    it('skips writing when user declines overwrite', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(prompts).mockResolvedValueOnce({ overwrite: false })

      const cmd = createCommand('--target', 'claude')

      await cmd.run()

      expect(writeFile).not.toHaveBeenCalled()
      expect(getLogged(cmd).some(m => m.includes('Skipped'))).toBe(true)
    })

    it('overwrites when user confirms', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(prompts).mockResolvedValueOnce({ overwrite: true })

      const cmd = createCommand('--target', 'claude')

      await cmd.run()

      expect(writeFile).toHaveBeenCalled()
    })

    it('skips confirmation with --force', async () => {
      vi.mocked(access).mockResolvedValue(undefined)

      const cmd = createCommand('--target', 'claude', '--force')

      await cmd.run()

      expect(prompts).not.toHaveBeenCalled()
      expect(writeFile).toHaveBeenCalled()
    })
  })

  describe('non-interactive mode', () => {
    beforeEach(() => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
    })

    it('prints usage guidance when no flags provided', async () => {
      const cmd = createCommand()

      await cmd.run()

      const logged = getLogged(cmd)
      expect(logged.some(m => m.includes('--target claude'))).toBe(true)
      expect(logged.some(m => m.includes('--target cursor'))).toBe(true)
      expect(logged.some(m => m.includes('--target windsurf'))).toBe(true)
      expect(logged.some(m => m.includes('--target github-copilot'))).toBe(true)
      expect(logged.some(m => m.includes('--target goose'))).toBe(true)
      expect(logged.some(m => m.includes('--path'))).toBe(true)
      expect(writeFile).not.toHaveBeenCalled()
    })

    it('also prints usage guidance in ci mode', async () => {
      vi.mocked(detectCliMode).mockReturnValue('ci')

      const cmd = createCommand()

      await cmd.run()

      const logged = getLogged(cmd)
      expect(logged.some(m => m.includes('--target claude'))).toBe(true)
      expect(writeFile).not.toHaveBeenCalled()
    })

    it('installs without prompting when file does not exist', async () => {
      const cmd = createCommand('--target', 'claude')

      await cmd.run()

      const expectedDir = join(process.cwd(), '.claude/skills/checkly')
      expect(prompts).not.toHaveBeenCalled()
      expect(writeFile).toHaveBeenCalledWith(
        join(expectedDir, 'SKILL.md'),
        SKILL_CONTENT,
        'utf8',
      )
      expect(getLogged(cmd).some(m => m.includes('Installed Checkly agent skill to:'))).toBe(true)
    })

    it('skips with warning when file already exists', async () => {
      vi.mocked(access).mockResolvedValue(undefined)

      const cmd = createCommand('--target', 'claude')

      await cmd.run()

      expect(prompts).not.toHaveBeenCalled()
      expect(writeFile).not.toHaveBeenCalled()
      expect(getLogged(cmd).some(m => m.includes('--force'))).toBe(true)
    })
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
      const result = await readSkillFile()

      expect(readFile).toHaveBeenCalledWith(SKILL_FILE_PATH, 'utf8')
      expect(result).toBe(SKILL_CONTENT)
    })

    it('throws on read failure', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      await expect(readSkillFile()).rejects.toThrow('Failed to read skill file')
    })
  })

  describe('writeSkillToTarget()', () => {
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
      vi.mocked(mkdir).mockRejectedValue(new Error('EACCES'))

      await expect(writeSkillToTarget('some/dir', 'content')).rejects.toThrow('Failed to create directory')
    })

    it('throws on writeFile failure', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('EACCES'))

      await expect(writeSkillToTarget('some/dir', 'content')).rejects.toThrow('Failed to write skill file')
    })
  })

  describe('interactive mode', () => {
    it('cancels when user selects nothing', async () => {
      vi.mocked(prompts).mockResolvedValueOnce({ platform: undefined })

      const cmd = createCommand()

      await cmd.run()

      expect(getLogged(cmd).some(m => m.includes('Cancelled. No skill file written.'))).toBe(true)
      expect(writeFile).not.toHaveBeenCalled()
    })

    it('installs to selected platform directory', async () => {
      vi.mocked(prompts).mockResolvedValueOnce({ platform: 'claude' })

      const cmd = createCommand()

      await cmd.run()

      const expectedDir = join(process.cwd(), '.claude/skills/checkly')
      expect(writeFile).toHaveBeenCalledWith(
        join(expectedDir, 'SKILL.md'),
        SKILL_CONTENT,
        'utf8',
      )
    })

    it('prompts for custom path when selected', async () => {
      vi.mocked(prompts)
        .mockResolvedValueOnce({ platform: '__custom__' })
        .mockResolvedValueOnce({ customPath: 'my/custom/dir' })

      const cmd = createCommand()

      await cmd.run()

      const expectedDir = join(process.cwd(), 'my/custom/dir')
      expect(writeFile).toHaveBeenCalledWith(
        join(expectedDir, 'SKILL.md'),
        SKILL_CONTENT,
        'utf8',
      )
    })

    it('cancels when custom path is empty', async () => {
      vi.mocked(prompts)
        .mockResolvedValueOnce({ platform: '__custom__' })
        .mockResolvedValueOnce({ customPath: '' })

      const cmd = createCommand()

      await cmd.run()

      expect(getLogged(cmd).some(m => m.includes('Cancelled. No skill file written.'))).toBe(true)
      expect(writeFile).not.toHaveBeenCalled()
    })
  })
})
