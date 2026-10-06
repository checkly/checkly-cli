import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({ validateAuthentication: vi.fn() }))
vi.mock('../../services/config', () => {
  const data = {
    store: {} as Record<string, unknown>,
    set: vi.fn((key: string, value: unknown) => {
      data.store = { ...data.store, [key]: value }
    }),
  }
  return { default: { data } }
})

import * as api from '../../rest/api.js'
import config from '../../services/config.js'
import { activateAccount } from '../activate-account.js'

describe('activateAccount()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.data.store = { accountId: 'acc-1', accountName: 'Acme' } as any
  })

  it('stores the account id and name and validates the credentials', async () => {
    vi.mocked(api.validateAuthentication).mockResolvedValue(undefined)

    await activateAccount({ id: 'acc-2', name: 'Globex' })

    expect(config.data.store).toEqual({ accountId: 'acc-2', accountName: 'Globex' })
    expect(api.validateAuthentication).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous account when the credentials do not work with the new one', async () => {
    vi.mocked(api.validateAuthentication).mockRejectedValue(new Error('Authentication failed'))

    await expect(activateAccount({ id: 'acc-2', name: 'Globex' })).rejects.toThrow('Authentication failed')

    expect(config.data.store).toEqual({ accountId: 'acc-1', accountName: 'Acme' })
  })
})
