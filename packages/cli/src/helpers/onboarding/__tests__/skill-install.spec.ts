import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../../commands/skills/install', () => ({
  PLATFORM_TARGETS: {
    claude: '.claude/skills/checkly',
    cursor: '.cursor/skills/checkly',
  },
  readSkillFile: vi.fn(),
  writeSkillToTarget: vi.fn(),
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
import { readSkillFile, writeSkillToTarget } from '../../../commands/skills/install'
import { detectCliMode, detectOperator } from '../../cli-mode'
import { runSkillInstallStep } from '../skill-install'

const mockDetectCliMode = vi.mocked(detectCliMode)
const mockDetectOperator = vi.mocked(detectOperator)
const mockReadSkillFile = vi.mocked(readSkillFile)
const mockWriteSkillToTarget = vi.mocked(writeSkillToTarget)
const mockPrompts = vi.mocked(prompts)

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

    it('prompts for install, prompts for platform, writes skill file', async () => {
      mockPrompts
        .mockResolvedValueOnce({ install: true })
        .mockResolvedValueOnce({ platform: 'claude' })

      const result = await runSkillInstallStep(log)

      expect(mockPrompts).toHaveBeenCalledTimes(2)
      expect(mockPrompts).toHaveBeenNthCalledWith(1, expect.objectContaining({
        type: 'confirm',
        name: 'install',
      }), expect.objectContaining({ onCancel: expect.any(Function) }))
      expect(mockPrompts).toHaveBeenNthCalledWith(2, expect.objectContaining({
        type: 'select',
        name: 'platform',
      }), expect.objectContaining({ onCancel: expect.any(Function) }))
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
      expect(mockReadSkillFile).not.toHaveBeenCalled()
      expect(mockWriteSkillToTarget).not.toHaveBeenCalled()
      expect(result).toEqual({
        installed: false,
        platform: null,
        targetPath: null,
      })
    })

    it('prompts for custom path when user selects custom path option', async () => {
      mockWriteSkillToTarget.mockResolvedValue('/project/my/custom/path/SKILL.md')
      mockPrompts
        .mockResolvedValueOnce({ install: true })
        .mockResolvedValueOnce({ platform: '__custom__' })
        .mockResolvedValueOnce({ customPath: 'my/custom/path' })

      const result = await runSkillInstallStep(log)

      expect(mockPrompts).toHaveBeenCalledTimes(3)
      expect(mockPrompts).toHaveBeenNthCalledWith(3, expect.objectContaining({
        type: 'text',
        name: 'customPath',
      }), expect.objectContaining({ onCancel: expect.any(Function) }))
      expect(mockWriteSkillToTarget).toHaveBeenCalledWith('my/custom/path', '# Checkly Skill')
      expect(result).toEqual({
        installed: true,
        platform: null,
        targetPath: '/project/my/custom/path/SKILL.md',
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
