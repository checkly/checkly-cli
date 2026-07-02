import { describe, expect, it, vi } from 'vitest'

import Rules from '../rules.js'

const mockConfig = {
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand (...args: string[]) {
  const cmd = new Rules(args, mockConfig)
  cmd.log = vi.fn() as any
  return cmd
}

function getLogged (cmd: Rules): string[] {
  return (cmd.log as ReturnType<typeof vi.fn>).mock.calls.map(
    (call: string[]) => call[0],
  )
}

describe('rules', () => {
  it('prints the deprecation message pointing to skills', async () => {
    const cmd = createCommand()

    await cmd.run()

    const logged = getLogged(cmd)
    expect(logged.some(m => m.includes('is deprecated'))).toBe(true)
    expect(logged.some(m => m.includes('checkly skills'))).toBe(true)
  })
})
