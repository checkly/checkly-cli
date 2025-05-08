import config from 'config'
import { describe, it, expect, beforeEach } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('login', () => {
  beforeEach(async () => {
    await runChecklyCli({
      args: ['logout'],
      promptsInjection: [true],
      timeout: 5000,
    })
  })

  it('should show warning with environment variables are configured', async () => {
    const { status, stderr } = await runChecklyCli({
      args: ['login'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      timeout: 5000,
    })
    expect(stderr).toContain('Warning: `CHECKLY_API_KEY` or `CHECKLY_ACCOUNT_ID` environment variables')
    expect(stderr).toContain('are configured. You must delete them to use `npx checkly login`.\n')
    expect(status).toBe(0)
  }, 10000)

  it('should show URL to login', async () => {
    const { status, stdout, stderr } = await runChecklyCli({
      args: ['login'],
      promptsInjection: ['login', false],
      timeout: 5000,
    })

    expect(stdout).toContain('Please open the following URL in your browser:')
    expect(stdout).toContain('https://auth.checklyhq.com/authorize?')
    // URL should allow to login
    expect(stdout).toContain('mode=&allowLogin=true&allowSignUp=false')

    expect(stderr).toBe('')

    // the command should timeout and status shouldn't be 0
    expect(status).not.toBe(0)
  })

  it('should show URL to signup', async () => {
    const { status, stdout, stderr } = await runChecklyCli({
      args: ['login'],
      promptsInjection: ['signup', false],
      timeout: 5000,
    })

    expect(stdout).toContain('Please open the following URL in your browser:')
    expect(stdout).toContain('https://auth.checklyhq.com/authorize?')
    // URL should allow to signup
    expect(stdout).toContain('mode=signUp&allowLogin=false&allowSignUp=true')

    expect(stderr).toBe('')

    // the command should timeout and status shouldn't be 0
    expect(status).not.toBe(0)
  })
})
