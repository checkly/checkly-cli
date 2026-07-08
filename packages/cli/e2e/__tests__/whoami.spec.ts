import config from 'config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('whomai', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should give correct user', async () => {
    const { stdout } = await runCheckly(fixt, ['whoami'])
    expect(stdout).toContain(config.get('accountName'))
    expect(stdout).toContain('Plan:')
    // env credentials are set, so whoami notes the account comes from the environment
    expect(stdout).toContain('resolved from your environment')
  })
})
