import { describe, it, expect, vi, beforeEach } from 'vitest'
import Init from '../init'

vi.mock('../../helpers/onboarding/detect-project', () => ({ detectProjectContext: vi.fn() }))
vi.mock('../../helpers/onboarding/skill-install', () => ({ runSkillInstallStep: vi.fn(), refreshSkill: vi.fn() }))
vi.mock('../../helpers/onboarding/boilerplate', () => ({
  runDepsInstall: vi.fn(),
  createConfig: vi.fn(),
  copyChecks: vi.fn(),
}))
vi.mock('../../helpers/onboarding/template-prompt', () => ({ loadPromptTemplate: vi.fn() }))
vi.mock('../../helpers/onboarding/prompt-display', () => ({ displayStarterPrompt: vi.fn() }))
vi.mock('../../helpers/onboarding/messages', () => ({
  greeting: vi.fn(() => 'greeting'),
  footer: vi.fn(() => 'footer'),
  agentFooter: vi.fn(() => 'agent-footer'),
  existingProjectFooter: vi.fn(() => 'existing-footer'),
  playwrightHint: vi.fn(() => 'pw-hint'),
}))
vi.mock('../../helpers/cli-mode', () => ({ detectCliMode: vi.fn() }))
vi.mock('../../helpers/onboarding/prompts-helpers', () => ({
  makeOnCancel: vi.fn(() => vi.fn()),
  successMessage: vi.fn((msg: string) => `OK ${msg}`),
}))
vi.mock('prompts', () => ({ default: vi.fn() }))

import { detectProjectContext } from '../../helpers/onboarding/detect-project'
import { runSkillInstallStep, refreshSkill } from '../../helpers/onboarding/skill-install'
import { runDepsInstall, createConfig, copyChecks } from '../../helpers/onboarding/boilerplate'
import { loadPromptTemplate } from '../../helpers/onboarding/template-prompt'
import { displayStarterPrompt } from '../../helpers/onboarding/prompt-display'
import { greeting, footer, agentFooter, existingProjectFooter, playwrightHint } from '../../helpers/onboarding/messages'
import { detectCliMode } from '../../helpers/cli-mode'
import prompts from 'prompts'

const mockConfig = {
  version: '1.0.0',
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand () {
  const cmd = new Init([], mockConfig)
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
  vi.mocked(detectProjectContext).mockReturnValue(pristineContext)
  vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: false, platform: null, targetPath: null })
  vi.mocked(refreshSkill).mockResolvedValue({ installed: false, targetPath: null })
  vi.mocked(runDepsInstall).mockResolvedValue(undefined)
  vi.mocked(createConfig).mockReturnValue(undefined)
  vi.mocked(copyChecks).mockReturnValue(undefined)
  vi.mocked(loadPromptTemplate).mockResolvedValue('prompt-text')
  vi.mocked(displayStarterPrompt).mockResolvedValue(undefined)
  vi.mocked(prompts).mockResolvedValue({})
})

describe('Init command', () => {
  it('exits when no package.json found', async () => {
    vi.mocked(detectProjectContext).mockReturnValue({ ...pristineContext, isExistingProject: false })
    const cmd = createCommand()
    await cmd.run()
    expect(cmd.log).toHaveBeenCalledWith(expect.stringContaining('No package.json found'))
    expect(runSkillInstallStep).not.toHaveBeenCalled()
  })

  describe('agent mode', () => {
    it('outputs JSON, no greeting', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/t' })
      const cmd = createCommand()
      await cmd.run()
      expect(greeting).not.toHaveBeenCalled()
      const jsonCall = vi.mocked(cmd.log).mock.calls.find(
        ([msg]) => typeof msg === 'string' && msg.includes('"success":true'),
      )
      expect(jsonCall).toBeDefined()
    })

    it('skips config and deps if already configured', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      vi.mocked(detectProjectContext).mockReturnValue({ ...pristineContext, hasChecklyConfig: true })
      const cmd = createCommand()
      await cmd.run()
      expect(createConfig).not.toHaveBeenCalled()
      expect(runDepsInstall).not.toHaveBeenCalled()
    })
  })

  describe('pristine project', () => {
    it('skill installed: deps + prompt + agent footer, no boilerplate', async () => {
      vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/t' })
      const cmd = createCommand()
      await cmd.run()
      expect(runDepsInstall).toHaveBeenCalled()
      expect(displayStarterPrompt).toHaveBeenCalled()
      expect(agentFooter).toHaveBeenCalledWith('claude', false)
      expect(createConfig).not.toHaveBeenCalled()
      expect(copyChecks).not.toHaveBeenCalled()
    })

    it('skill installed + PW: playwright prompt + agent footer with PW flag', async () => {
      vi.mocked(detectProjectContext).mockReturnValue({
        ...pristineContext,
        hasPlaywrightConfig: true,
        playwrightConfigPath: '/pw.config.ts',
      })
      vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'cursor', targetPath: '/t' })
      const cmd = createCommand()
      await cmd.run()
      expect(loadPromptTemplate).toHaveBeenCalledWith('playwright', expect.objectContaining({
        playwrightConfigPath: '/pw.config.ts',
      }))
      expect(agentFooter).toHaveBeenCalledWith('cursor', true)
    })

    it('skill declined + wants examples: config + checks + deps + footer', async () => {
      vi.mocked(prompts).mockResolvedValue({ wantExamples: true })
      const cmd = createCommand()
      await cmd.run()
      expect(createConfig).toHaveBeenCalled()
      expect(copyChecks).toHaveBeenCalled()
      expect(runDepsInstall).toHaveBeenCalled()
      expect(footer).toHaveBeenCalledWith(false)
    })

    it('skill declined + no examples: deps only + footer', async () => {
      vi.mocked(prompts).mockResolvedValue({ wantExamples: false })
      const cmd = createCommand()
      await cmd.run()
      expect(createConfig).not.toHaveBeenCalled()
      expect(copyChecks).not.toHaveBeenCalled()
      expect(runDepsInstall).toHaveBeenCalled()
    })

    it('skill declined + PW config: shows playwrightHint + footer with PW', async () => {
      vi.mocked(detectProjectContext).mockReturnValue({
        ...pristineContext,
        hasPlaywrightConfig: true,
        playwrightConfigPath: '/pw.config.ts',
      })
      const cmd = createCommand()
      await cmd.run()
      expect(playwrightHint).toHaveBeenCalled()
      expect(footer).toHaveBeenCalledWith(true)
    })
  })

  describe('existing Checkly project', () => {
    const existingContext = {
      ...pristineContext,
      hasChecklyConfig: true,
      hasChecksDir: true,
    }

    it('has skill: refreshes silently, shows existing footer, no boilerplate/deps', async () => {
      vi.mocked(detectProjectContext).mockReturnValue({
        ...existingContext,
        hasSkillInstalled: true,
        skillPath: '/p/.claude/skills/checkly/SKILL.md',
      })
      const cmd = createCommand()
      await cmd.run()
      expect(runSkillInstallStep).not.toHaveBeenCalled()
      expect(existingProjectFooter).toHaveBeenCalled()
      expect(createConfig).not.toHaveBeenCalled()
      expect(runDepsInstall).not.toHaveBeenCalled()
    })

    it('no skill + installs: existing-project prompt + agent footer', async () => {
      vi.mocked(detectProjectContext).mockReturnValue(existingContext)
      vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'windsurf', targetPath: '/t' })
      const cmd = createCommand()
      await cmd.run()
      expect(loadPromptTemplate).toHaveBeenCalledWith('existing', expect.any(Object))
      expect(displayStarterPrompt).toHaveBeenCalled()
      expect(agentFooter).toHaveBeenCalledWith('windsurf', false)
    })

    it('no skill + installs + PW: existing-playwright prompt', async () => {
      vi.mocked(detectProjectContext).mockReturnValue({
        ...existingContext,
        hasPlaywrightConfig: true,
        playwrightConfigPath: '/pw.config.ts',
      })
      vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/t' })
      const cmd = createCommand()
      await cmd.run()
      expect(loadPromptTemplate).toHaveBeenCalledWith('existing-playwright', expect.objectContaining({
        playwrightConfigPath: '/pw.config.ts',
      }))
      expect(agentFooter).toHaveBeenCalledWith('claude', true)
    })

    it('no skill + declines: shows existing footer', async () => {
      vi.mocked(detectProjectContext).mockReturnValue(existingContext)
      const cmd = createCommand()
      await cmd.run()
      expect(existingProjectFooter).toHaveBeenCalled()
      expect(displayStarterPrompt).not.toHaveBeenCalled()
    })
  })
})
