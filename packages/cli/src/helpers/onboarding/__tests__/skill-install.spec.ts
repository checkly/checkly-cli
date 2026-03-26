import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../../commands/skills/install', () => ({
  PLATFORM_TARGETS: {
    claude: '.claude/skills/checkly',
    cursor: '.cursor/skills/checkly',
  },
  readSkillFile: vi.fn(),
  writeSkillToTarget: vi.fn(),
  formatPlatformName: vi.fn((name: string) => name.charAt(0).toUpperCase() + name.slice(1)),
  promptForPlatformTarget: vi.fn(),
}))

vi.mock('../../cli-mode', () => ({
  detectCliMode: vi.fn(),
  detectOperator: vi.fn(),
  OPERATOR_TO_PLATFORM: {
    'claude-code': 'claude',
    'cursor': 'cursor',
  },
}))

vi.mock('prompts', () => ({
  default: vi.fn(),
}))

import prompts from 'prompts'
import { readSkillFile, writeSkillToTarget, promptForPlatformTarget } from '../../../commands/skills/install'
import { detectCliMode, detectOperator } from '../../cli-mode'
import { runSkillInstallStep } from '../skill-install'

const mockDetectCliMode = vi.mocked(detectCliMode)
const mockDetectOperator = vi.mocked(detectOperator)
const mockReadSkillFile = vi.mocked(readSkillFile)
const mockWriteSkillToTarget = vi.mocked(writeSkillToTarget)
const mockPrompts = vi.mocked(prompts)
const mockPromptForPlatformTarget = vi.mocked(promptForPlatformTarget)

describe('runSkillInstallStep', () => {
  let logs: string[]
  let log: (msg: string) => void

  beforeEach(() => {
    logs = []
    log = (msg: string) => logs.push(msg)
    vi.resetAllMocks()
    mockReadSkillFile.mockResolvedValue('# Checkly Skill')
    mockWriteSkillToTarget.mockResolvedValue('/project/.claude/skills/checkly/SKILL.md')
  })

  describe('interactive mode', () => {
    beforeEach(() => {
      mockDetectCliMode.mockReturnValue('interactive')
    })

    it('prompts for install, uses promptForPlatformTarget, writes skill file', async () => {
      mockPrompts.mockResolvedValueOnce({ install: true })
      mockPromptForPlatformTarget.mockResolvedValue('.claude/skills/checkly')

      const result = await runSkillInstallStep(log)

      expect(mockPrompts).toHaveBeenCalledTimes(1)
      expect(mockPrompts).toHaveBeenNthCalledWith(1, expect.objectContaining({
        type: 'confirm',
        name: 'install',
      }), expect.objectContaining({ onCancel: expect.any(Function) }))
      expect(mockPromptForPlatformTarget).toHaveBeenCalledWith(expect.any(Function))
      expect(mockReadSkillFile).toHaveBeenCalled()
      expect(mockWriteSkillToTarget).toHaveBeenCalledWith('.claude/skills/checkly', '# Checkly Skill')
      expect(result).toEqual({
        installed: true,
        platform: 'claude',
        targetPath: '/project/.claude/skills/checkly/SKILL.md',
      })
    })

    it('returns installed false when user declines install', async () => {
      mockPrompts.mockResolvedValueOnce({ install: false })

      const result = await runSkillInstallStep(log)

      expect(mockPrompts).toHaveBeenCalledTimes(1)
      expect(mockPromptForPlatformTarget).not.toHaveBeenCalled()
      expect(mockReadSkillFile).not.toHaveBeenCalled()
      expect(mockWriteSkillToTarget).not.toHaveBeenCalled()
      expect(result).toEqual({
        installed: false,
        platform: null,
        targetPath: null,
      })
    })

    it('handles custom path (no matching platform)', async () => {
      mockWriteSkillToTarget.mockResolvedValue('/project/my/custom/path/SKILL.md')
      mockPrompts.mockResolvedValueOnce({ install: true })
      mockPromptForPlatformTarget.mockResolvedValue('my/custom/path')

      const result = await runSkillInstallStep(log)

      expect(mockPromptForPlatformTarget).toHaveBeenCalledWith(expect.any(Function))
      expect(mockWriteSkillToTarget).toHaveBeenCalledWith('my/custom/path', '# Checkly Skill')
      expect(result).toEqual({
        installed: true,
        platform: null,
        targetPath: '/project/my/custom/path/SKILL.md',
      })
    })

    it('does not log preamble text before prompting', async () => {
      mockPrompts.mockResolvedValueOnce({ install: false })

      await runSkillInstallStep(log)

      // No "AI-native" explainer — that context is provided by init.ts now
      const allOutput = logs.join('\n')
      expect(allOutput).not.toContain('AI-native Monitoring as Code')
      expect(allOutput).not.toContain('teaches it how to')
    })

    it('returns installed false when promptForPlatformTarget returns undefined', async () => {
      mockPrompts.mockResolvedValueOnce({ install: true })
      mockPromptForPlatformTarget.mockResolvedValue(undefined)

      const result = await runSkillInstallStep(log)

      expect(mockReadSkillFile).not.toHaveBeenCalled()
      expect(result).toEqual({
        installed: false,
        platform: null,
        targetPath: null,
      })
    })
  })

  describe('agent mode', () => {
    beforeEach(() => {
      mockDetectCliMode.mockReturnValue('agent')
    })

    it('auto-detects operator, maps to platform, writes skill without prompting', async () => {
      mockDetectOperator.mockReturnValue('claude-code')

      const result = await runSkillInstallStep(log)

      expect(mockPrompts).not.toHaveBeenCalled()
      expect(mockReadSkillFile).toHaveBeenCalled()
      expect(mockWriteSkillToTarget).toHaveBeenCalledWith('.claude/skills/checkly', '# Checkly Skill')
      expect(result).toEqual({
        installed: true,
        platform: 'claude',
        targetPath: '/project/.claude/skills/checkly/SKILL.md',
      })
    })

    it('returns installed false for unknown operator', async () => {
      mockDetectOperator.mockReturnValue('unknown-operator')

      const result = await runSkillInstallStep(log)

      expect(mockPrompts).not.toHaveBeenCalled()
      expect(mockReadSkillFile).not.toHaveBeenCalled()
      expect(mockWriteSkillToTarget).not.toHaveBeenCalled()
      expect(result).toEqual({
        installed: false,
        platform: null,
        targetPath: null,
      })
    })
  })

  describe('CI mode', () => {
    it('skips installation entirely', async () => {
      mockDetectCliMode.mockReturnValue('ci')

      const result = await runSkillInstallStep(log)

      expect(mockPrompts).not.toHaveBeenCalled()
      expect(mockReadSkillFile).not.toHaveBeenCalled()
      expect(mockWriteSkillToTarget).not.toHaveBeenCalled()
      expect(result).toEqual({
        installed: false,
        platform: null,
        targetPath: null,
      })
    })
  })
})
