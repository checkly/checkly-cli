import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../clipboard', () => ({
  copyToClipboard: vi.fn(),
}))
vi.mock('prompts', () => ({
  default: vi.fn(),
}))

import { copyToClipboard } from '../clipboard'
import prompts from 'prompts'
import { formatPromptPreview, displayStarterPrompt } from '../prompt-display'

const mockCopyToClipboard = vi.mocked(copyToClipboard)
const mockPrompts = vi.mocked(prompts)

function makeLines (n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')
}

describe('formatPromptPreview', () => {
  it('returns full text if within preview limit', () => {
    const text = makeLines(5)
    const result = formatPromptPreview(text)
    expect(result).toBe(text)
  })

  it('returns full text for exactly the preview limit', () => {
    const text = makeLines(5)
    const result = formatPromptPreview(text, 5)
    expect(result).toBe(text)
  })

  it('truncates to preview lines and adds "..." indicator for long text', () => {
    const text = makeLines(10)
    const result = formatPromptPreview(text)
    const resultLines = result.split('\n')
    // First 5 lines preserved
    expect(resultLines[0]).toBe('line 1')
    expect(resultLines[4]).toBe('line 5')
    // 6th line is the "..." indicator
    expect(resultLines[5]).toContain('5 more lines')
    // Total should be 6 lines (5 content + 1 indicator)
    expect(resultLines.length).toBe(6)
  })

  it('uses custom maxLines parameter', () => {
    const text = makeLines(10)
    const result = formatPromptPreview(text, 3)
    const resultLines = result.split('\n')
    expect(resultLines[0]).toBe('line 1')
    expect(resultLines[2]).toBe('line 3')
    expect(resultLines[3]).toContain('7 more lines')
  })
})

describe('displayStarterPrompt', () => {
  let logs: string[]
  let log: (msg: string) => void

  beforeEach(() => {
    logs = []
    log = (msg: string) => logs.push(msg)
    mockCopyToClipboard.mockReset()
    mockPrompts.mockReset()
  })

  it('copies to clipboard and shows "Copied to clipboard!" on success', async () => {
    mockCopyToClipboard.mockReturnValue(true)
    const text = makeLines(3)

    await displayStarterPrompt(text, log)

    expect(mockCopyToClipboard).toHaveBeenCalledWith(text)
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('Copied to clipboard!')
    expect(allOutput).toContain('Paste this into your AI agent')
  })

  it('shows "Copy the prompt below" on clipboard failure', async () => {
    mockCopyToClipboard.mockReturnValue(false)
    const text = makeLines(3)

    await displayStarterPrompt(text, log)

    expect(mockCopyToClipboard).toHaveBeenCalledWith(text)
    const allOutput = logs.join('\n')
    expect(allOutput).not.toContain('Copied to clipboard!')
    expect(allOutput).toContain('Copy the prompt below')
  })

  it('shows full text for short prompts without expand option', async () => {
    mockCopyToClipboard.mockReturnValue(true)
    const text = makeLines(3)

    await displayStarterPrompt(text, log)

    // prompts should not be called for short text
    expect(mockPrompts).not.toHaveBeenCalled()
    // All lines should appear in output
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('line 1')
    expect(allOutput).toContain('line 3')
  })

  it('shows preview + expand option for long prompts', async () => {
    mockCopyToClipboard.mockReturnValue(true)
    // Return 'continue' (user does not expand)
    mockPrompts.mockResolvedValue({ action: 'continue' })
    const text = makeLines(10)

    await displayStarterPrompt(text, log)

    // prompts should be called with a select question
    expect(mockPrompts).toHaveBeenCalledWith(expect.objectContaining({
      type: 'select',
      name: 'action',
    }))

    // Preview lines should appear
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('line 1')
    expect(allOutput).toContain('line 5')
    expect(allOutput).toContain('5 more lines')
    // line 6 should not appear in output (not expanded)
    expect(allOutput).not.toContain('line 6\n')
  })

  it('shows full prompt when user selects expand', async () => {
    mockCopyToClipboard.mockReturnValue(true)
    mockPrompts.mockResolvedValue({ action: 'expand' })
    const text = makeLines(10)

    await displayStarterPrompt(text, log)

    const allOutput = logs.join('\n')
    expect(allOutput).toContain('line 6')
    expect(allOutput).toContain('line 10')
  })
})
