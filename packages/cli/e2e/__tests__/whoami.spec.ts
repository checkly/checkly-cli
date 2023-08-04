import { runChecklyCli } from '../run-checkly'
import * as config from 'config'

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
