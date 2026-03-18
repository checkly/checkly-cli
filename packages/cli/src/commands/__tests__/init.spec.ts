import { describe, it, expect, vi, beforeEach } from 'vitest'
import Init from '../init'

vi.mock('../../helpers/onboarding/detect-project', () => ({ detectProjectContext: vi.fn() }))
vi.mock('../../helpers/onboarding/skill-install', () => ({ runSkillInstallStep: vi.fn() }))
vi.mock('../../helpers/onboarding/boilerplate', () => ({
  runBoilerplateSetup: vi.fn(),
  runDepsInstall: vi.fn(),
  createConfig: vi.fn(),
  copyChecks: vi.fn(),
}))
vi.mock('../../helpers/onboarding/template-prompt', () => ({ loadPromptTemplate: vi.fn() }))
vi.mock('../../helpers/onboarding/prompt-display', () => ({ displayStarterPrompt: vi.fn() }))
vi.mock('../../helpers/onboarding/messages', () => ({
  greeting: vi.fn(() => 'greeting'),
  footer: vi.fn(() => 'footer'),
  playwrightHint: vi.fn(() => 'pw-hint'),
}))
vi.mock('../../helpers/cli-mode', () => ({ detectCliMode: vi.fn() }))
vi.mock('../skills/install', () => ({
  readSkillFile: vi.fn(),
  writeSkillToTarget: vi.fn(),
  PLATFORM_TARGETS: {},
}))
vi.mock('prompts', () => ({ default: vi.fn() }))

import { detectProjectContext } from '../../helpers/onboarding/detect-project'
import { runSkillInstallStep } from '../../helpers/onboarding/skill-install'
import { runBoilerplateSetup, runDepsInstall, createConfig, copyChecks } from '../../helpers/onboarding/boilerplate'
import { loadPromptTemplate } from '../../helpers/onboarding/template-prompt'
import { displayStarterPrompt } from '../../helpers/onboarding/prompt-display'
import { greeting, playwrightHint } from '../../helpers/onboarding/messages'
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

const brandNewContext = {
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
  vi.mocked(detectProjectContext).mockReturnValue(brandNewContext)
  vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: false, platform: null, targetPath: null })
  vi.mocked(runBoilerplateSetup).mockResolvedValue(undefined)
  vi.mocked(runDepsInstall).mockResolvedValue(undefined)
  vi.mocked(createConfig).mockReturnValue(undefined)
  vi.mocked(copyChecks).mockReturnValue(undefined)
  vi.mocked(loadPromptTemplate).mockResolvedValue('prompt-text')
  vi.mocked(displayStarterPrompt).mockResolvedValue(undefined)
  vi.mocked(prompts).mockResolvedValue({})
})

describe('Init command', () => {
  it('logs message and returns when no package.json found', async () => {
    vi.mocked(detectProjectContext).mockReturnValue({ ...brandNewContext, isExistingProject: false })
    const cmd = createCommand()

    await cmd.run()

    expect(cmd.log).toHaveBeenCalledWith(expect.stringContaining('No package.json found'))
    expect(runSkillInstallStep).not.toHaveBeenCalled()
  })

  describe('agent mode', () => {
    it('outputs JSON with skill and context info', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/tmp/.claude' })
      const cmd = createCommand()

      await cmd.run()

      expect(greeting).not.toHaveBeenCalled()
      const jsonCall = vi.mocked(cmd.log).mock.calls.find(
        ([msg]) => typeof msg === 'string' && msg.includes('"success":true'),
      )
      expect(jsonCall).toBeDefined()
      const parsed = JSON.parse(jsonCall![0] as string)
      expect(parsed.success).toBe(true)
      expect(parsed.skillInstalled).toBe(true)
    })

    it('skips config creation if checkly config already exists', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      vi.mocked(detectProjectContext).mockReturnValue({ ...brandNewContext, hasChecklyConfig: true })
      const cmd = createCommand()

      await cmd.run()

      expect(createConfig).not.toHaveBeenCalled()
      expect(runDepsInstall).not.toHaveBeenCalled()
    })
  })

  describe('brand new project (no checkly config)', () => {
    it('skill installed: shows prompt, offers boilerplate separately', async () => {
      vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/tmp/.claude' })
      vi.mocked(prompts).mockResolvedValue({ wantBoilerplate: false })
      const cmd = createCommand()

      await cmd.run()

      expect(greeting).toHaveBeenCalledWith('1.0.0')
      expect(displayStarterPrompt).toHaveBeenCalledWith('prompt-text', expect.any(Function))
      expect(prompts).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('example checks') }),
        expect.any(Object),
      )
      expect(cmd.log).toHaveBeenCalledWith('footer')
    })

    it('skill installed + wants boilerplate: creates config, checks, and installs deps separately', async () => {
      vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/tmp/.claude' })
      vi.mocked(prompts).mockResolvedValue({ wantBoilerplate: true })
      const cmd = createCommand()

      await cmd.run()

      expect(createConfig).toHaveBeenCalled()
      expect(copyChecks).toHaveBeenCalled()
      expect(runDepsInstall).toHaveBeenCalled()
    })

    it('skill installed + PW config: uses playwright template', async () => {
      vi.mocked(detectProjectContext).mockReturnValue({
        ...brandNewContext,
        hasPlaywrightConfig: true,
        playwrightConfigPath: '/project/playwright.config.ts',
      })
      vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/tmp/.claude' })
      const cmd = createCommand()

      await cmd.run()

      expect(loadPromptTemplate).toHaveBeenCalledWith('playwright', expect.objectContaining({
        playwrightConfigPath: '/project/playwright.config.ts',
      }))
    })

    it('skill declined: creates config + checks + deps, no prompt display', async () => {
      const cmd = createCommand()

      await cmd.run()

      expect(createConfig).toHaveBeenCalled()
      expect(copyChecks).toHaveBeenCalled()
      expect(runDepsInstall).toHaveBeenCalled()
      expect(displayStarterPrompt).not.toHaveBeenCalled()
      expect(cmd.log).toHaveBeenCalledWith('footer')
    })

    it('skill declined + PW config: shows playwrightHint', async () => {
      vi.mocked(detectProjectContext).mockReturnValue({
        ...brandNewContext,
        hasPlaywrightConfig: true,
        playwrightConfigPath: '/project/playwright.config.ts',
      })
      const cmd = createCommand()

      await cmd.run()

      expect(playwrightHint).toHaveBeenCalled()
      expect(cmd.log).toHaveBeenCalledWith('pw-hint')
    })
  })

  describe('existing Checkly project (has config)', () => {
    const existingContext = {
      ...brandNewContext,
      hasChecklyConfig: true,
      hasChecksDir: true,
    }

    it('no skill installed: offers skill install, no boilerplate', async () => {
      vi.mocked(detectProjectContext).mockReturnValue(existingContext)
      const cmd = createCommand()

      await cmd.run()

      expect(runSkillInstallStep).toHaveBeenCalled()
      expect(createConfig).not.toHaveBeenCalled()
      expect(copyChecks).not.toHaveBeenCalled()
      expect(runDepsInstall).not.toHaveBeenCalled()
      expect(runBoilerplateSetup).not.toHaveBeenCalled()
    })

    it('skill already installed: shows prompt directly without asking to install', async () => {
      vi.mocked(detectProjectContext).mockReturnValue({
        ...existingContext,
        hasSkillInstalled: true,
        skillPath: '/project/.claude/skills/checkly/SKILL.md',
      })
      const cmd = createCommand()

      await cmd.run()

      // Should NOT prompt for skill install (runSkillInstallStep not called for existing skill)
      expect(runSkillInstallStep).not.toHaveBeenCalled()
      expect(displayStarterPrompt).toHaveBeenCalled()
      expect(createConfig).not.toHaveBeenCalled()
      expect(copyChecks).not.toHaveBeenCalled()
    })
  })
})
