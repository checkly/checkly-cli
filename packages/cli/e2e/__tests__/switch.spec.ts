import { runChecklyCliForSwitch } from '../run-checkly'
import * as config from 'config'
import '../command-matchers'

describe('switch', () => {
  jest.setTimeout(10000)
  it('should switch between user accounts', async () => {
    const result = await runChecklyCliForSwitch({
      args: ['switch'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.stdout).toContain('Select a new Checkly account')
    expect(result.stdout).toContain('Account switched to')
    expect(result.exitCode).toBe(0)
  })
})
