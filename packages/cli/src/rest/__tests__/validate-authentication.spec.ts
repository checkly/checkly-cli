import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/config', () => ({
  default: {
    hasValidCredentials: vi.fn(),
    hasEnvVarsConfigured: vi.fn(),
    getApiKey: vi.fn(),
    getAccountId: vi.fn(),
    getApiUrl: vi.fn(() => 'http://127.0.0.1:3000'),
  },
}))

import config from '../../services/config.js'
import { validateAuthentication } from '../api.js'

describe('validateAuthentication() without complete credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CHECKLY_SKIP_AUTH
    vi.mocked(config.hasValidCredentials).mockReturnValue(false)
  })

  it('suggests logging in when nothing comes from the environment', async () => {
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(false)

    await expect(validateAuthentication()).rejects.toThrow('Run `npx checkly login`')
  })

  it('names CHECKLY_ACCOUNT_ID when only the API key is set', async () => {
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(true)
    vi.mocked(config.getApiKey).mockReturnValue('cak_env')

    const error = await validateAuthentication().catch(e => e)

    expect(error.message).toMatch(/^`CHECKLY_ACCOUNT_ID` is not set/)
    expect(error.message).not.toContain('npx checkly login')
  })

  it('names CHECKLY_API_KEY when only the account id is set', async () => {
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(true)
    vi.mocked(config.getApiKey).mockReturnValue('')

    await expect(validateAuthentication()).rejects.toThrow(/^`CHECKLY_API_KEY` is not set/)
  })
})
