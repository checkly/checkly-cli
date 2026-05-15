import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('logout', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({ template: 'bare' })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should logout', async () => {
    const { stdout, stderr } = await runCheckly(fixt, ['logout'], {
      promptsInjection: [true],
      timeout: 5000,
    })

    expect(stdout).toContain('See you soon! 👋')
    expect(stderr).toBe('')
  })
})
