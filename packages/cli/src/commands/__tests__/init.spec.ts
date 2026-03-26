import { describe, it, expect, vi, beforeEach } from 'vitest'
import Init from '../init'

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
  footer,
  agentFooter,
  noSkillWarning,
  existingProjectFooter,
} from '../../helpers/onboarding/messages'
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
  vi.mocked(runSkillInstallStep).mockResolvedValue({
    installed: false,
    platform: null,
    targetPath: null,
  })
  vi.mocked(refreshSkill).mockResolvedValue({
    installed: false,
    targetPath: null,
  })
  vi.mocked(runDepsInstall).mockResolvedValue(undefined)
  vi.mocked(createConfig).mockReturnValue(undefined)
  vi.mocked(copyChecks).mockReturnValue(undefined)
  vi.mocked(loadPromptTemplate).mockResolvedValue('prompt-text')
  vi.mocked(displayStarterPrompt).mockResolvedValue(undefined)
  vi.mocked(prompts).mockResolvedValue({})
})

describe('Init command', () => {
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
  })

  describe('new project — AI path', () => {
    it('AI + skill installed: config + deps + prompt + agent footer', async () => {
      vi.mocked(prompts).mockResolvedValue({ wantAgent: true })
      vi.mocked(runSkillInstallStep).mockResolvedValue({
        installed: true,
        platform: 'claude',
        targetPath: '/t',
      })
      const cmd = createCommand()
      await cmd.run()
      expect(createConfig).toHaveBeenCalled()
      expect(runDepsInstall).toHaveBeenCalled()
      expect(displayStarterPrompt).toHaveBeenCalled()
      expect(agentFooter).toHaveBeenCalledWith('claude', false)
      expect(noSkillWarning).not.toHaveBeenCalled()
    })

    it('AI + skill installed + PW: uses playwright template', async () => {
      vi.mocked(detectProjectContext).mockReturnValue({
        ...pristineContext,
        hasPlaywrightConfig: true,
        playwrightConfigPath: '/pw.config.ts',
      })
      vi.mocked(prompts).mockResolvedValue({ wantAgent: true })
      vi.mocked(runSkillInstallStep).mockResolvedValue({
        installed: true,
        platform: 'cursor',
        targetPath: '/t',
      })
      const cmd = createCommand()
      await cmd.run()
      expect(loadPromptTemplate).toHaveBeenCalledWith(
        'playwright',
        expect.objectContaining({
          playwrightConfigPath: '/pw.config.ts',
        }),
      )
      expect(agentFooter).toHaveBeenCalledWith('cursor', true)
    })

    it('AI + skill declined: config + deps + prompt + warning + agent footer', async () => {
      vi.mocked(prompts).mockResolvedValue({ wantAgent: true })
      // runSkillInstallStep returns not installed (default mock)
      const cmd = createCommand()
      await cmd.run()
      expect(createConfig).toHaveBeenCalled()
      expect(runDepsInstall).toHaveBeenCalled()
      expect(noSkillWarning).toHaveBeenCalled()
      expect(displayStarterPrompt).toHaveBeenCalled()
      expect(agentFooter).toHaveBeenCalledWith(null, false)
    })
  })

  describe('new project — manual path', () => {
    it('always creates config, offers demo checks', async () => {
      vi.mocked(prompts)
        .mockResolvedValueOnce({ wantAgent: false })
        .mockResolvedValueOnce({ wantExamples: true })
      const cmd = createCommand()
      await cmd.run()
      expect(createConfig).toHaveBeenCalled()
      expect(copyChecks).toHaveBeenCalled()
      expect(runDepsInstall).toHaveBeenCalled()
      expect(footer).toHaveBeenCalled()
      expect(displayStarterPrompt).not.toHaveBeenCalled()
    })

    it('manual + no demo checks: config + deps + footer', async () => {
      vi.mocked(prompts)
        .mockResolvedValueOnce({ wantAgent: false })
        .mockResolvedValueOnce({ wantExamples: false })
      const cmd = createCommand()
      await cmd.run()
      expect(createConfig).toHaveBeenCalled()
      expect(copyChecks).not.toHaveBeenCalled()
      expect(runDepsInstall).toHaveBeenCalled()
      expect(footer).toHaveBeenCalled()
    })

    it('manual + PW: passes hasPlaywright to footer', async () => {
      vi.mocked(detectProjectContext).mockReturnValue({
        ...pristineContext,
        hasPlaywrightConfig: true,
        playwrightConfigPath: '/pw.config.ts',
      })
      vi.mocked(prompts)
        .mockResolvedValueOnce({ wantAgent: false })
        .mockResolvedValueOnce({ wantExamples: false })
      const cmd = createCommand()
      await cmd.run()
      expect(footer).toHaveBeenCalledWith(true)
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
  })
})
