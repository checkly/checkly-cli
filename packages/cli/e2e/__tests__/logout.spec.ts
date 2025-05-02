import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('logout', () => {
  it('should logout', async () => {
    const { status, stdout, stderr } = await runChecklyCli({
      args: ['logout'],
      promptsInjection: [true],
      timeout: 5000,
    })

    expect(stdout).toContain('See you soon! 👋')
    expect(stderr).toBe('')
    expect(status).toBe(0)
  })
})
