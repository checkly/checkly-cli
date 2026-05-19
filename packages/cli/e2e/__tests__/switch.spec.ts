import config from 'config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('switch', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should switch between user accounts', async () => {
    const accountName = config.get('accountName') as string
    const { stdout, stderr } = await runCheckly(fixt, ['switch'], {
      promptsInjection: [{
        id: config.get('accountId') as string,
        name: accountName,
        runtimeId: '2024.02', // Not important for this command.
      }],
      timeout: 5000,
    })

    expect(stdout).toContain(`Account switched to ${accountName}`)
    expect(stderr).toBe('')
  })
})
