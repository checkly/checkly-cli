import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('prompts', () => ({ default: vi.fn() }))
vi.mock('../../rest/api', () => ({}))
vi.mock('../../helpers/cli-mode', async importOriginal => ({
  ...await importOriginal<typeof import('../../helpers/cli-mode.js')>(),
  detectCliMode: vi.fn(),
}))
vi.mock('../../services/config', () => ({
  default: {
    clear: vi.fn(),
    hasEnvVarsConfigured: vi.fn(() => false),
    data: { get: vi.fn(() => 'Acme') },
  },
}))

import prompts from 'prompts'
import { detectCliMode } from '../../helpers/cli-mode.js'
import config from '../../services/config.js'
import Logout from '../logout.js'

const mockConfig = {
  version: '1.0.0',
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand (...argv: string[]) {
  const cmd = new Logout(argv, mockConfig)
  cmd.log = vi.fn() as any
  cmd.warn = vi.fn() as any
  cmd.exit = vi.fn((code: number) => {
    throw new Error(`EXIT_${code}`)
  }) as any
  return cmd
}

const originalStdinIsTTY = process.stdin.isTTY

describe('checkly logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CHECKLY_CLI_MODE
    process.stdin.isTTY = true
  })

  afterEach(() => {
    process.stdin.isTTY = originalStdinIsTTY
    delete process.env.CHECKLY_CLI_MODE
  })

  it('asks a person at a terminal and keeps the session when they say no', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ confirm: false })

    await expect(createCommand().run()).rejects.toThrow('EXIT_0')

    expect(prompts).toHaveBeenCalledTimes(1)
    expect(config.clear).not.toHaveBeenCalled()
  })

  it('clears the session when a person at a terminal confirms', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ confirm: true })

    await createCommand().run()

    expect(config.clear).toHaveBeenCalled()
  })

  it.each([
    ['an agent', 'agent', true],
    ['CI', 'ci', true],
    ['an interactive run without a terminal', 'interactive', false],
  ] as const)('logs out without asking for %s, since nobody could answer', async (_, mode, tty) => {
    vi.mocked(detectCliMode).mockReturnValue(mode)
    process.stdin.isTTY = tty as any

    await createCommand().run()

    expect(prompts).not.toHaveBeenCalled()
    expect(config.clear).toHaveBeenCalled()
  })

  it('never asks with --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')

    await createCommand('--force').run()

    expect(prompts).not.toHaveBeenCalled()
    expect(config.clear).toHaveBeenCalled()
  })
})
