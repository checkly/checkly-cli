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
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../errors.js'
import * as api from '../api.js'
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

describe('validateAuthentication() with rejected credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CHECKLY_SKIP_AUTH
    vi.mocked(config.hasValidCredentials).mockReturnValue(true)
    vi.mocked(config.getAccountId).mockReturnValue('acc-1')
    vi.mocked(config.getApiKey).mockReturnValue('cak_secret1234')
    vi.spyOn(api.accounts, 'get').mockRejectedValue(
      new UnauthorizedError({ statusCode: 401, error: 'Unauthorized', message: 'Unauthorized' } as any))
  })

  it('tells a stored login to log in again', async () => {
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(false)

    const error = await validateAuthentication().catch(e => e)

    expect(error.message).toContain('...1234')
    expect(error.message).toContain('Run `npx checkly login` to log in again.')
    expect(error.message).not.toContain('cak_secret')
  })

  it('does not suggest logging in while trying another account', async () => {
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(false)

    const error = await validateAuthentication({ suggestLogin: false }).catch(e => e)

    expect(error.message).not.toContain('npx checkly login')
  })

  const accountGone = [
    ['access to it was removed', () => new ForbiddenError({ statusCode: 403, error: 'Forbidden', message: 'Forbidden' } as any)],
    ['it was deleted', () => new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'Not Found' } as any)],
  ] as const

  it.each(accountGone)('tells a stored login whose account is gone (%s) to log in again', async (_, error) => {
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(false)
    const original = error()
    vi.spyOn(api.accounts, 'get').mockRejectedValue(original)

    const thrown = await validateAuthentication().catch(e => e)

    expect(thrown.message).toBe('Account "acc-1" is not available with the stored login. Run `npx checkly login` to log in again.')
    expect(thrown.cause).toBe(original)
  })

  it.each(accountGone)('passes the error on unchanged for environment credentials (%s)', async (_, error) => {
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(true)
    const original = error()
    vi.spyOn(api.accounts, 'get').mockRejectedValue(original)

    await expect(validateAuthentication()).rejects.toBe(original)
  })

  it.each(accountGone)('passes the error on unchanged while trying another account (%s)', async (_, error) => {
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(false)
    const original = error()
    vi.spyOn(api.accounts, 'get').mockRejectedValue(original)

    await expect(validateAuthentication({ suggestLogin: false })).rejects.toBe(original)
  })

  it('does not suggest logging in when the credentials come from the environment', async () => {
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(true)

    const error = await validateAuthentication().catch(e => e)

    expect(error.message).not.toContain('npx checkly login')
  })
})
