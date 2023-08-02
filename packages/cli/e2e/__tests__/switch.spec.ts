import { runChecklyCli } from '../run-checkly'
import * as config from 'config'

describe('switch', () => {
  it('should switch between user accounts', () => {
    const accountName = config.get('accountName') as string
    const { status, stdout, stderr } = runChecklyCli({
      args: ['switch'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      promptsInjection: [{
        id: config.get('accountId') as string,
        name: accountName,
      }],
    })
    expect(stdout).toBe(`Account switched to ${accountName}\n`)
    expect(stderr).toBe('')
    expect(status).toBe(0)
  })
})
