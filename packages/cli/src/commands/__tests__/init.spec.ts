import { join } from 'path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Init from '../init'

vi.mock('../skills/install', () => ({
  PLATFORM_TARGETS: {
    claude: '.claude/skills/checkly',
    codex: '.agents/skills/checkly',
  },
  readSkillFile: vi.fn(),
  writeSkillToTarget: vi.fn(),
}))
vi.mock('../../helpers/onboarding/detect-project', () => ({
  detectProjectContext: vi.fn(),
}))
vi.mock('../../helpers/onboarding/skill-install', () => ({
  runSkillInstallStep: vi.fn(),
  refreshSkill: vi.fn(),
}))
vi.mock('../../helpers/onboarding/boilerplate', () => ({
  runDepsInstall: vi.fn(),
  createConfig: vi.fn(),
  copyChecks: vi.fn(),
}))
vi.mock('../../helpers/onboarding/template-prompt', () => ({
  loadPromptTemplate: vi.fn(),
}))
vi.mock('../../helpers/onboarding/prompt-display', () => ({
  displayStarterPrompt: vi.fn(),
}))
vi.mock('../../helpers/onboarding/messages', () => ({
  greeting: vi.fn(() => 'greeting'),
  footer: vi.fn(() => 'footer'),
  agentFooter: vi.fn(() => 'agent-footer'),
  noSkillWarning: vi.fn(() => 'no-skill-warning'),
  existingProjectFooter: vi.fn(() => 'existing-footer'),
}))
vi.mock('../../helpers/cli-mode', () => ({ detectCliMode: vi.fn() }))
vi.mock('../../helpers/onboarding/prompts-helpers', () => ({
  makeOnCancel: vi.fn(() => vi.fn()),
  successMessage: vi.fn((msg: string) => `OK ${msg}`),
}))
vi.mock('prompts', () => ({ default: vi.fn() }))
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, writeFileSync: vi.fn() }
})

import { writeFileSync } from 'fs'
import {
  readSkillFile,
  writeSkillToTarget,
} from '../skills/install'
import { detectProjectContext } from '../../helpers/onboarding/detect-project'
import {
  runSkillInstallStep,
  refreshSkill,
} from '../../helpers/onboarding/skill-install'
import {
  runDepsInstall,
  createConfig,
  copyChecks,
} from '../../helpers/onboarding/boilerplate'
import { loadPromptTemplate } from '../../helpers/onboarding/template-prompt'
import { displayStarterPrompt } from '../../helpers/onboarding/prompt-display'
import {
  greeting,
  existingProjectFooter,
} from '../../helpers/onboarding/messages'
import { detectCliMode } from '../../helpers/cli-mode'
import prompts from 'prompts'

const mockConfig = {
  version: '1.0.0',
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand (...args: string[]) {
  const cmd = new Init(args, mockConfig)
  cmd.log = vi.fn() as any
  return cmd
}

const pristineContext = {
  isExistingProject: true,
  hasPlaywrightConfig: false,
  playwrightConfigPath: null,
  hasChecklyConfig: false,
  hasChecksDir: false,
  hasSkillInstalled: false,
  skillPath: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(detectCliMode).mockReturnValue('interactive')
  vi.mocked(detectProjectContext).mockImplementation(() => ({
    ...pristineContext,
  }))
  vi.mocked(readSkillFile).mockResolvedValue('# checkly skill')
  vi.mocked(writeSkillToTarget).mockResolvedValue(
    '/project/.claude/skills/checkly/SKILL.md',
  )
  vi.mocked(runSkillInstallStep).mockResolvedValue({
    installed: false,
    platform: null,
    targetPath: null,
  })
  vi.mocked(refreshSkill).mockResolvedValue({
    installed: false,
    targetPath: null,
  })
  vi.mocked(runDepsInstall).mockResolvedValue({
    ok: true,
    packageJsonUpdated: true,
    installed: true,
  })
  vi.mocked(createConfig).mockReturnValue({
    ok: true,
    created: true,
  })
  vi.mocked(copyChecks).mockReturnValue(undefined)
  vi.mocked(loadPromptTemplate).mockResolvedValue('prompt-text')
  vi.mocked(displayStarterPrompt).mockResolvedValue(undefined)
  vi.mocked(prompts).mockResolvedValue({})
})

describe('Init command', () => {
  it('sanitizes generated package names when creating package.json', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/My App')
    try {
      vi.mocked(detectProjectContext)
        .mockReturnValueOnce({
          ...pristineContext,
          isExistingProject: false,
        })
        .mockReturnValueOnce(pristineContext)
      vi.mocked(prompts)
        .mockResolvedValueOnce({ createPkg: true })
        .mockResolvedValueOnce({ wantAgent: false })
        .mockResolvedValueOnce({ wantExamples: false })

      const cmd = createCommand()
      await cmd.run()

      expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
        join('/tmp/My App', 'package.json'),
        expect.stringContaining('"name": "my-app"'),
      )
    } finally {
      cwdSpy.mockRestore()
    }
  })

  it('exits when no package.json and user declines creation', async () => {
    vi.mocked(detectProjectContext).mockReturnValue({
      ...pristineContext,
      isExistingProject: false,
    })
    vi.mocked(prompts).mockResolvedValue({ createPkg: false })
    const cmd = createCommand()
    await cmd.run()
    expect(runSkillInstallStep).not.toHaveBeenCalled()
  })

  it('creates package.json when missing and user accepts', async () => {
    vi.mocked(detectProjectContext)
      .mockReturnValueOnce({
        ...pristineContext,
        isExistingProject: false,
      })
      .mockReturnValueOnce(pristineContext) // re-detect after creation
    vi.mocked(prompts)
      .mockResolvedValueOnce({ createPkg: true })
      .mockResolvedValueOnce({ wantAgent: false }) // manual path
      .mockResolvedValueOnce({ wantExamples: false }) // no demo checks
    const cmd = createCommand()
    await cmd.run()
  })

  describe('agent mode', () => {
    it('outputs JSON, no greeting', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      vi.mocked(detectProjectContext)
        .mockReturnValueOnce(pristineContext)
        .mockReturnValueOnce({
          ...pristineContext,
          hasChecklyConfig: true,
        })
        .mockReturnValueOnce({
          ...pristineContext,
          hasChecklyConfig: true,
        })
      vi.mocked(runSkillInstallStep).mockResolvedValue({
        installed: true,
        platform: 'claude',
        targetPath: '/t',
      })
      const cmd = createCommand()
      await cmd.run()
      expect(greeting).not.toHaveBeenCalled()
      const jsonCall = vi.mocked(cmd.log).mock.calls.find(
        ([msg]) =>
          typeof msg === 'string' && msg.includes('"success":true'),
      )
      expect(jsonCall).toBeDefined()
      expect(jsonCall?.[0]).toContain('"hasChecklyConfig":true')
    })

    it('skips config and deps if already configured', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      vi.mocked(detectProjectContext).mockReturnValue({
        ...pristineContext,
        hasChecklyConfig: true,
      })
      const cmd = createCommand()
      await cmd.run()
      expect(createConfig).not.toHaveBeenCalled()
      expect(runDepsInstall).not.toHaveBeenCalled()
    })

    it('returns success false when setup fails', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      vi.mocked(createConfig).mockReturnValue({
        ok: false,
        created: false,
      })
      const cmd = createCommand()
      await cmd.run()

      expect(runDepsInstall).not.toHaveBeenCalled()
      const jsonCall = vi.mocked(cmd.log).mock.calls.find(
        ([msg]) =>
          typeof msg === 'string' && msg.includes('"success":false'),
      )
      expect(jsonCall).toBeDefined()
      expect(jsonCall?.[0]).toContain('Could not create checkly.config.ts')
    })

    it('reuses the explicit --target install instead of auto-installing again', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      vi.mocked(detectProjectContext)
        .mockReturnValueOnce(pristineContext)
        .mockReturnValueOnce({
          ...pristineContext,
          hasSkillInstalled: true,
          skillPath: '/project/.claude/skills/checkly/SKILL.md',
        })
        .mockReturnValueOnce({
          ...pristineContext,
          hasSkillInstalled: true,
          skillPath: '/project/.claude/skills/checkly/SKILL.md',
          hasChecklyConfig: true,
        })

      const cmd = createCommand('--target', 'claude')
      await cmd.run()

      expect(runSkillInstallStep).not.toHaveBeenCalled()
      const jsonCall = vi.mocked(cmd.log).mock.calls.find(
        ([msg]) =>
          typeof msg === 'string' && msg.includes('"success":true'),
      )
      expect(jsonCall?.[0]).toContain('"skillPlatform":"claude"')
    })
  })

  describe('existing Checkly project', () => {
    const existingContext = {
      ...pristineContext,
      hasChecklyConfig: true,
      hasChecksDir: true,
    }

    it('has skill: refreshes silently, shows footer, no prompt', async () => {
      vi.mocked(detectProjectContext).mockReturnValue({
        ...existingContext,
        hasSkillInstalled: true,
        skillPath: '/p/.claude/skills/checkly/SKILL.md',
      })
      const cmd = createCommand()
      await cmd.run()
      expect(refreshSkill).toHaveBeenCalled()
      expect(existingProjectFooter).toHaveBeenCalled()
      expect(displayStarterPrompt).not.toHaveBeenCalled()
      expect(loadPromptTemplate).not.toHaveBeenCalled()
    })

    it('no skill + installs: shows footer, no prompt', async () => {
      vi.mocked(detectProjectContext).mockReturnValue(existingContext)
      vi.mocked(runSkillInstallStep).mockResolvedValue({
        installed: true,
        platform: 'windsurf',
        targetPath: '/t',
      })
      const cmd = createCommand()
      await cmd.run()
      expect(existingProjectFooter).toHaveBeenCalled()
      // No starter prompt for existing projects
      expect(displayStarterPrompt).not.toHaveBeenCalled()
      expect(loadPromptTemplate).not.toHaveBeenCalled()
    })

    it('no skill + declines: shows footer', async () => {
      vi.mocked(detectProjectContext).mockReturnValue(existingContext)
      const cmd = createCommand()
      await cmd.run()
      expect(existingProjectFooter).toHaveBeenCalled()
      expect(displayStarterPrompt).not.toHaveBeenCalled()
    })

    it('explicit --target skips the follow-up skill step', async () => {
      vi.mocked(detectProjectContext)
        .mockReturnValueOnce(existingContext)
        .mockReturnValueOnce({
          ...existingContext,
          hasSkillInstalled: true,
          skillPath: '/project/.claude/skills/checkly/SKILL.md',
        })
      const cmd = createCommand('--target', 'claude')
      await cmd.run()

      expect(runSkillInstallStep).not.toHaveBeenCalled()
      expect(refreshSkill).not.toHaveBeenCalled()
      expect(existingProjectFooter).toHaveBeenCalled()
    })
  })
})
