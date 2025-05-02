import config from 'config'
import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('whomai', () => {
  it('should give correct user', async () => {
    const { stdout } = await runChecklyCli({
      args: ['whoami'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(stdout).toContain(config.get('accountName'))
  })
})
