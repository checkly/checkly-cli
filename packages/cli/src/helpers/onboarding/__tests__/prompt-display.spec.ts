import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../clipboard', () => ({
  copyToClipboard: vi.fn(),
}))
vi.mock('prompts', () => ({
  default: vi.fn(),
}))
vi.mock('../prompts-helpers', () => ({
  makeOnCancel: vi.fn(() => vi.fn()),
}))

import { copyToClipboard } from '../clipboard'
import prompts from 'prompts'
import { displayStarterPrompt } from '../prompt-display'

const mockCopyToClipboard = vi.mocked(copyToClipboard)
const mockPrompts = vi.mocked(prompts)

describe('displayStarterPrompt', () => {
  let logs: string[]
  let log: (msg: string) => void

  beforeEach(() => {
    logs = []
    log = (msg: string) => logs.push(msg)
    mockCopyToClipboard.mockReset()
    mockPrompts.mockReset()
  })

  it('shows full prompt text always (no truncation)', async () => {
    mockPrompts.mockResolvedValue({ copy: false })
    const text = 'Initialize Checkly in this project at /my/project.\nSet up monitoring.'

    await displayStarterPrompt(text, log)

    const allOutput = logs.join('\n')
    expect(allOutput).toContain('Initialize Checkly in this project')
    expect(allOutput).toContain('Set up monitoring.')
  })

  it('wraps prompt lines to the 80 character display width', async () => {
    mockPrompts.mockResolvedValue({ copy: false })
    const text = 'Initialize Checkly in this project and set up monitoring checks tailored to the codebase with a sentence long enough to wrap.'

    await displayStarterPrompt(text, log)

    const promptLines = logs
      .join('\n')
      .split('\n')
      .filter(line => line.startsWith('  ') && !line.includes('Starter prompt'))

    expect(promptLines.length).toBeGreaterThan(1)
    expect(promptLines.every(line => line.length <= 80)).toBe(true)
  })

  it('hard-wraps long path segments that exceed the prompt width', async () => {
    mockPrompts.mockResolvedValue({ copy: false })
    const text = 'Path /Users/herve/Dev/checkly/checkly-cli/projects/with-a-very-long-directory-name-that-needs-wrapping should stay within bounds.'

    await displayStarterPrompt(text, log)

    const promptLines = logs
      .join('\n')
      .split('\n')
      .filter(line => line.startsWith('  ') && !line.includes('Starter prompt'))

    expect(promptLines.every(line => line.length <= 80)).toBe(true)
  })

  it('asks to copy to clipboard and copies on yes', async () => {
    mockCopyToClipboard.mockReturnValue(true)
    mockPrompts.mockResolvedValue({ copy: true })

    await displayStarterPrompt('prompt text', log)

    expect(mockPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirm',
        name: 'copy',
      }),
      expect.any(Object),
    )
    expect(mockCopyToClipboard).toHaveBeenCalledWith('prompt text')
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('The prompt is copied to your clipboard!')
  })

  it('does not copy when user declines', async () => {
    mockPrompts.mockResolvedValue({ copy: false })

    await displayStarterPrompt('prompt text', log)

    expect(mockCopyToClipboard).not.toHaveBeenCalled()
  })

  it('shows fallback message when clipboard fails', async () => {
    mockCopyToClipboard.mockReturnValue(false)
    mockPrompts.mockResolvedValue({ copy: true })

    await displayStarterPrompt('prompt text', log)

    expect(mockCopyToClipboard).toHaveBeenCalledWith('prompt text')
    const allOutput = logs.join('\n')
    expect(allOutput).not.toContain('Copied')
    // Should show a helpful fallback — the prompt is already displayed above
  })

  it('does not use separator lines', async () => {
    mockPrompts.mockResolvedValue({ copy: false })

    await displayStarterPrompt('prompt text', log)

    const allOutput = logs.join('\n')
    expect(allOutput).not.toContain('━')
  })

  it('passes onCancel handler to prompts', async () => {
    mockPrompts.mockResolvedValue({ copy: false })

    await displayStarterPrompt('prompt text', log)

    expect(mockPrompts).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ onCancel: expect.any(Function) }),
    )
  })
})
