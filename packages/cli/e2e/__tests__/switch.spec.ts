import { runChecklyCli } from '../run-checkly'
import config from 'config'

describe('switch', () => {
  it('should switch between user accounts', async () => {
    const accountName = config.get('accountName') as string
    const { status, stdout, stderr } = await runChecklyCli({
      args: ['switch'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      promptsInjection: [{
        id: config.get('accountId') as string,
        name: accountName,
        runtimeId: '2024.02', // Not important for this command.
      }],
      timeout: 5000,
    })

    expect(stdout).toContain(`Account switched to ${accountName}\n`)
    expect(stderr).toBe('')
    expect(status).toBe(0)
  })
})
