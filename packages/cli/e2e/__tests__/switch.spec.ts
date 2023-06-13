import { runChecklyCliForSwitch } from '../run-checkly'
import * as config from 'config'

describe('switch', () => {
  it('should switch between user accounts', async () => {
    const { status, stdout } = await runChecklyCliForSwitch({
      args: ['switch'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(stdout).toContain('Select a new Checkly account')
    expect(stdout).toContain('Account switched to')
    expect(status).toBe(0)
  })
})
