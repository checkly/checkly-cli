import { describe, it, expect, vi, beforeEach } from 'vitest'
import Init from '../init'

vi.mock('../../helpers/onboarding/detect-project', () => ({ detectProjectContext: vi.fn() }))
vi.mock('../../helpers/onboarding/skill-install', () => ({ runSkillInstallStep: vi.fn() }))
vi.mock('../../helpers/onboarding/boilerplate', () => ({ runBoilerplateSetup: vi.fn() }))
vi.mock('../../helpers/onboarding/template-prompt', () => ({ loadPromptTemplate: vi.fn() }))
vi.mock('../../helpers/onboarding/prompt-display', () => ({ displayStarterPrompt: vi.fn() }))
vi.mock('../../helpers/onboarding/messages', () => ({
  greeting: vi.fn(() => 'greeting'),
  footer: vi.fn(() => 'footer'),
  playwrightHint: vi.fn(() => 'pw-hint'),
}))
vi.mock('../../helpers/cli-mode', () => ({ detectCliMode: vi.fn() }))
vi.mock('prompts', () => ({ default: vi.fn() }))

import { detectProjectContext } from '../../helpers/onboarding/detect-project'
import { runSkillInstallStep } from '../../helpers/onboarding/skill-install'
import { runBoilerplateSetup } from '../../helpers/onboarding/boilerplate'
import { loadPromptTemplate } from '../../helpers/onboarding/template-prompt'
import { displayStarterPrompt } from '../../helpers/onboarding/prompt-display'
import { greeting, footer, playwrightHint } from '../../helpers/onboarding/messages'
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

const defaultContext = {
  isExistingProject: true,
  hasPlaywrightConfig: false,
  playwrightConfigPath: null,
  hasChecklyConfig: false,
  hasChecksDir: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(detectCliMode).mockReturnValue('interactive')
  vi.mocked(detectProjectContext).mockReturnValue(defaultContext)
  vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: false, platform: null, targetPath: null })
  vi.mocked(runBoilerplateSetup).mockResolvedValue(undefined)
  vi.mocked(loadPromptTemplate).mockResolvedValue('prompt-text')
  vi.mocked(displayStarterPrompt).mockResolvedValue(undefined)
  vi.mocked(prompts).mockResolvedValue({ alsoBoilerplate: false })
})

describe('Init command', () => {
  it('logs message and returns when no package.json found', async () => {
    vi.mocked(detectProjectContext).mockReturnValue({ ...defaultContext, isExistingProject: false })
    const cmd = createCommand()

    await cmd.run()

    expect(cmd.log).toHaveBeenCalledWith(expect.stringContaining('No package.json found'))
    expect(runSkillInstallStep).not.toHaveBeenCalled()
    expect(runBoilerplateSetup).not.toHaveBeenCalled()
  })

  it('runs agent mode: skill install + config-only boilerplate + JSON output', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/tmp/.claude' })
    const cmd = createCommand()

    await cmd.run()

    expect(greeting).not.toHaveBeenCalled()
    expect(runSkillInstallStep).toHaveBeenCalled()
    expect(runBoilerplateSetup).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      { skipPrompts: true, configOnly: true },
    )
    const jsonCall = vi.mocked(cmd.log).mock.calls.find(
      ([msg]) => typeof msg === 'string' && msg.includes('"success":true'),
    )
    expect(jsonCall).toBeDefined()
    const parsed = JSON.parse(jsonCall![0] as string)
    expect(parsed.success).toBe(true)
    expect(parsed.skillInstalled).toBe(true)
  })

  it('interactive + skill installed (no PW): greeting, base prompt, display, offer boilerplate (declined), footer', async () => {
    vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/tmp/.claude' })
    vi.mocked(prompts).mockResolvedValue({ alsoBoilerplate: false })
    const cmd = createCommand()

    await cmd.run()

    expect(greeting).toHaveBeenCalledWith('1.0.0')
    expect(cmd.log).toHaveBeenCalledWith('greeting')
    expect(loadPromptTemplate).toHaveBeenCalledWith('base', expect.objectContaining({ projectPath: expect.any(String) }))
    expect(displayStarterPrompt).toHaveBeenCalledWith('prompt-text', expect.any(Function))
    expect(runBoilerplateSetup).not.toHaveBeenCalled()
    expect(cmd.log).toHaveBeenCalledWith('footer')
  })

  it('interactive + skill installed (with PW): uses playwright template', async () => {
    vi.mocked(detectProjectContext).mockReturnValue({
      ...defaultContext,
      hasPlaywrightConfig: true,
      playwrightConfigPath: '/project/playwright.config.ts',
    })
    vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/tmp/.claude' })
    const cmd = createCommand()

    await cmd.run()

    expect(loadPromptTemplate).toHaveBeenCalledWith('playwright', expect.objectContaining({
      projectPath: expect.any(String),
      playwrightConfigPath: '/project/playwright.config.ts',
    }))
  })

  it('interactive + skill installed + wants boilerplate: runs boilerplate setup', async () => {
    vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: true, platform: 'claude', targetPath: '/tmp/.claude' })
    vi.mocked(prompts).mockResolvedValue({ alsoBoilerplate: true })
    const cmd = createCommand()

    await cmd.run()

    expect(runBoilerplateSetup).toHaveBeenCalledWith(expect.any(String), expect.any(Function))
  })

  it('interactive + skill declined: greeting, boilerplate, footer', async () => {
    vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: false, platform: null, targetPath: null })
    const cmd = createCommand()

    await cmd.run()

    expect(greeting).toHaveBeenCalledWith('1.0.0')
    expect(runBoilerplateSetup).toHaveBeenCalledWith(expect.any(String), expect.any(Function))
    expect(loadPromptTemplate).not.toHaveBeenCalled()
    expect(displayStarterPrompt).not.toHaveBeenCalled()
    expect(cmd.log).toHaveBeenCalledWith('footer')
  })

  it('interactive + skill declined + PW config: shows playwrightHint', async () => {
    vi.mocked(detectProjectContext).mockReturnValue({
      ...defaultContext,
      hasPlaywrightConfig: true,
      playwrightConfigPath: '/project/playwright.config.ts',
    })
    vi.mocked(runSkillInstallStep).mockResolvedValue({ installed: false, platform: null, targetPath: null })
    const cmd = createCommand()

    await cmd.run()

    expect(playwrightHint).toHaveBeenCalled()
    expect(cmd.log).toHaveBeenCalledWith('pw-hint')
    expect(cmd.log).toHaveBeenCalledWith('footer')
  })
})
