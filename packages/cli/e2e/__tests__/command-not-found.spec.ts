import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('command-not-found', () => {
  it('points users to the docs and skills command for unknown commands', async () => {
    const { status, stderr } = await runChecklyCli({
      args: ['does-not-exist'],
    })

    expect(status).toBe(127)
    expect(stderr).toContain('does-not-exist is not a checkly command')
    expect(stderr).toContain('https://www.checklyhq.com/docs/cli/')
    expect(stderr).toContain('checkly skills')
    expect(stderr).toContain('checkly help')
  })
})
