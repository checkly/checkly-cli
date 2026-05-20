import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('cli parse error', () => {
  it('hints at the skills command on unknown flags', async () => {
    const { status, stderr } = await runChecklyCli({
      args: ['checks', 'list', '--does-not-exist'],
      env: { CHECKLY_SKIP_AUTH: '1' },
    })

    expect(status).not.toBe(0)
    expect(stderr).toContain('Nonexistent flag: --does-not-exist')
    expect(stderr).toContain('checkly skills')
  })

  it('hints at the skills command on invalid flag values', async () => {
    const { status, stderr } = await runChecklyCli({
      args: ['checks', 'list', '--output', 'bogus'],
      env: { CHECKLY_SKIP_AUTH: '1' },
    })

    expect(status).not.toBe(0)
    expect(stderr).toContain('checkly skills')
  })
})
