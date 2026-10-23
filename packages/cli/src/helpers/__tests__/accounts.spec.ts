import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/config', () => ({
  default: { getCredentialSource: vi.fn(), getAccountId: vi.fn(), hasAccountIdInEnvironment: vi.fn() },
}))

import config from '../../services/config.js'
import { accountNotAvailable, accountOverrideNotAvailable, accountOverrideNotice, formatAccounts } from '../accounts.js'

describe('formatAccounts()', () => {
  it('lists accounts as name and id', () => {
    expect(formatAccounts([{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }]))
      .toBe('Acme (acc-1), Globex (acc-2)')
  })
})

describe('accountOverrideNotice()', () => {
  beforeEach(() => {
    vi.mocked(config.getAccountId).mockReturnValue('acc-2')
  })

  it('names the account CHECKLY_ACCOUNT_ID picks instead of the default', () => {
    vi.mocked(config.getCredentialSource).mockReturnValue('account_override')

    expect(accountOverrideNotice()).toBe('`CHECKLY_ACCOUNT_ID` is set to "acc-2" (on the command line, in your shell '
      + 'or in .env), so commands use that account instead of the default until it is unset.')
  })

  it.each(['login', 'environment'] as const)('says nothing for %s credentials', source => {
    vi.mocked(config.getCredentialSource).mockReturnValue(source)

    expect(accountOverrideNotice()).toBeUndefined()
  })
})

describe('accountOverrideNotAvailable()', () => {
  it('lists the accounts the login works with when they are known', () => {
    expect(accountOverrideNotAvailable('acc-typo', [{ id: 'acc-1', name: 'Acme' }]))
      .toBe('Account "acc-typo" from `CHECKLY_ACCOUNT_ID` is not available with your login. '
        + 'This login works with: Acme (acc-1). Fix `CHECKLY_ACCOUNT_ID` where it is set (the command line, your shell or .env).')
  })

  it('still says where to fix it without the accounts', () => {
    expect(accountOverrideNotAvailable('acc-typo')).toBe('Account "acc-typo" from `CHECKLY_ACCOUNT_ID` is not '
      + 'available with your login. Fix `CHECKLY_ACCOUNT_ID` where it is set (the command line, your shell or .env).')
  })
})

describe('accountNotAvailable()', () => {
  it('tells a stored login to log in again', () => {
    vi.mocked(config.getCredentialSource).mockReturnValue('login')

    expect(accountNotAvailable('acc-1'))
      .toBe('Account "acc-1" is not available with the stored login. Run `npx checkly login` to log in again.')
  })

  it('names CHECKLY_ACCOUNT_ID when it picks an account for the login', () => {
    vi.mocked(config.getCredentialSource).mockReturnValue('account_override')

    expect(accountNotAvailable('acc-1', [{ id: 'acc-2', name: 'Globex' }]))
      .toBe(accountOverrideNotAvailable('acc-1', [{ id: 'acc-2', name: 'Globex' }]))
  })

  it('names both variables when they come from the environment', () => {
    vi.mocked(config.getCredentialSource).mockReturnValue('environment')
    vi.mocked(config.hasAccountIdInEnvironment).mockReturnValue(true)

    expect(accountNotAvailable('acc-1'))
      .toBe('Account "acc-1" from `CHECKLY_ACCOUNT_ID` is not available with `CHECKLY_API_KEY`. '
        + 'Fix them where they are set (the command line, your shell or .env).')
  })

  it('names the stored default when only the API key comes from the environment', () => {
    vi.mocked(config.getCredentialSource).mockReturnValue('environment')
    vi.mocked(config.hasAccountIdInEnvironment).mockReturnValue(false)

    expect(accountNotAvailable('acc-1'))
      .toBe('Account "acc-1", the default stored by `checkly login`, is not available with `CHECKLY_API_KEY`. '
        + 'Set `CHECKLY_ACCOUNT_ID` to the account the key belongs to (on the command line, in your shell or in .env).')
  })
})
