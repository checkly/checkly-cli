import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}))

import { readFile } from 'fs/promises'
import { ACTIONS } from '../../../ai-context/context.js'
import Skills from '../index.js'

const mockConfig = {
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand (...args: string[]) {
  const cmd = new Skills(args, mockConfig)
  cmd.log = vi.fn() as any
  cmd.logToStderr = vi.fn() as any
  return cmd
}

describe('checkly skills', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails with exit 1 when the action file cannot be read', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const cmd = createCommand(ACTIONS[0].id)

    await expect(cmd.run()).rejects.toMatchObject({
      message: `Could not read action file for "${ACTIONS[0].id}".`,
      oclif: { exit: 1 },
    })
  })

  it('rejects an unknown action as a usage error', async () => {
    const cmd = createCommand('no-such-action')

    await expect(cmd.run()).rejects.toMatchObject({
      message: expect.stringContaining('Action "no-such-action" not found.'),
      oclif: { exit: 2 },
    })
  })
})
