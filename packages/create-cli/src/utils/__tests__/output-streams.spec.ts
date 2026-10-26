import { describe, it, expect, afterEach, vi } from 'vitest'

const { promptsMock, oraMock } = vi.hoisted(() => ({
  promptsMock: vi.fn(),
  oraMock: vi.fn(() => ({ start: () => ({}) })),
}))

vi.mock('prompts', () => ({ default: promptsMock }))
vi.mock('ora', () => ({ default: oraMock }))

import { askInitializeGit, askPlaywrightConfigPath } from '../prompts.js'
import { hint } from '../messages.js'
import { spinner } from '../terminal.js'

describe('output streams', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    promptsMock.mockReset()
    oraMock.mockClear()
  })

  it('renders prompt questions on stderr and forwards onCancel', async () => {
    promptsMock.mockResolvedValue({ initializeGit: true })
    const onCancel = vi.fn()

    await askInitializeGit(onCancel)

    expect(promptsMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'initializeGit', stdout: process.stderr }),
      { onCancel },
    )
  })

  it('renders the playwright config question on stderr', async () => {
    promptsMock.mockResolvedValue({ playwrightConfigPath: '/project/playwright.config.ts' })

    await askPlaywrightConfigPath(['/project/playwright.config.ts'], '/project', vi.fn())

    expect(promptsMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'playwrightConfigPath', stdout: process.stderr }),
      expect.anything(),
    )
  })

  it('writes hints with console.error, not console.log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await hint('Cool.', 'a hint')

    expect(log).not.toHaveBeenCalled()
    expect(error.mock.calls.flat().join('')).toContain('a hint')
  })

  it('draws the spinner on stderr', () => {
    spinner('Working')

    expect(oraMock).toHaveBeenCalledWith(expect.objectContaining({ stream: process.stderr }))
  })
})
