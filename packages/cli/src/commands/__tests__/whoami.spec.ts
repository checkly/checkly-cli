import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  accounts: { getAll: vi.fn() },
  user: { get: vi.fn() },
}))
vi.mock('../../services/config', () => ({
  default: {
    getCredentialSource: vi.fn(),
    data: { store: {} as Record<string, unknown> },
  },
}))

import * as api from '../../rest/api.js'
import config from '../../services/config.js'
import Whoami from '../whoami.js'

const acme = { id: 'acc-1', name: 'Acme', runtimeId: '2025.04' }

function createCommand (...argv: string[]) {
  const cmd = new Whoami(argv, { version: '1.0.0', runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }) } as any)
  vi.spyOn(cmd, 'account', 'get').mockReturnValue(acme)
  cmd.log = vi.fn() as any
  return cmd
}

function output (cmd: Whoami): string {
  return vi.mocked(cmd.log).mock.calls.map(([line]) => String(line ?? '')).join('\n')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.user.get).mockResolvedValue({ data: { id: 'u1', name: 'Ada Lovelace' } } as any)
  config.data.store = {}
  vi.mocked(api.accounts.getAll).mockResolvedValue({ data: [acme] } as any)
  vi.mocked(config.getCredentialSource).mockReturnValue('login')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('checkly whoami', () => {
  it('lists the other accounts a login key works with', async () => {
    vi.mocked(api.accounts.getAll).mockResolvedValue({
      data: [acme, { id: 'acc-2', name: 'Globex' }, { id: 'acc-3', name: 'Initech' }],
    } as any)
    const cmd = createCommand()
    await cmd.run()

    expect(output(cmd)).toContain('You are currently on account "Acme" (acc-1) as Ada Lovelace.')
    expect(output(cmd)).toContain('Other accounts: "Globex" (acc-2), "Initech" (acc-3)')
  })

  it('lists no other accounts when there are none', async () => {
    const cmd = createCommand()
    await cmd.run()

    expect(output(cmd)).not.toContain('Other accounts')
  })

  it('does not look for other accounts with a key from CHECKLY_API_KEY, which belongs to one account', async () => {
    vi.mocked(config.getCredentialSource).mockReturnValue('environment')
    const cmd = createCommand()
    await cmd.run()

    expect(api.accounts.getAll).not.toHaveBeenCalled()
    expect(output(cmd)).toContain('resolved from your environment')
    expect(output(cmd)).not.toContain('Default account')
  })

  it('still answers when the accounts cannot be listed', async () => {
    vi.mocked(api.accounts.getAll).mockRejectedValue(new Error('boom'))
    const cmd = createCommand()
    await cmd.run()

    expect(output(cmd)).toContain('You are currently on account "Acme"')
  })

  it('names the stored default account', async () => {
    config.data.store = { accountId: 'acc-1', accountName: 'Acme' }
    const cmd = createCommand()
    await cmd.run()

    expect(output(cmd)).toContain('Default account: "Acme" (acc-1)')
  })

  it('says CHECKLY_ACCOUNT_ID picks the account until it is unset, naming the default', async () => {
    vi.mocked(config.getCredentialSource).mockReturnValue('account_override')
    config.data.store = { accountId: 'acc-2', accountName: 'Globex' }
    const cmd = createCommand()
    await cmd.run()

    expect(output(cmd)).toContain('`CHECKLY_ACCOUNT_ID` is set to "acc-1" (on the command line, in your shell or in .env), '
      + 'so commands use that account instead of the default until it is unset.')
    expect(output(cmd)).toContain('Default account: "Globex" (acc-2)')
    expect(output(cmd)).not.toContain('resolved from your environment')
  })

  it('says how to choose a default when none is set', async () => {
    vi.mocked(config.getCredentialSource).mockReturnValue('account_override')
    config.data.store = {}
    const cmd = createCommand()
    await cmd.run()

    // CHECKLY_ACCOUNT_ID already picks the account, so nothing nudges towards storing a default.
    expect(output(cmd)).toContain('Default account: none (not needed while `CHECKLY_ACCOUNT_ID` picks the account)')
  })

  describe('--output json', () => {
    function json (cmd: Whoami) {
      return JSON.parse(output(cmd))
    }

    it('reports the user, the account, where it comes from, the default and the other accounts', async () => {
      vi.mocked(api.accounts.getAll).mockResolvedValue({
        data: [{ ...acme, planDisplayName: 'Team', addons: {} }, { id: 'acc-2', name: 'Globex', runtimeId: 'x' }],
      } as any)
      config.data.store = { accountId: 'acc-1', accountName: 'Acme' }
      const cmd = createCommand('--output', 'json')
      vi.spyOn(cmd, 'account', 'get').mockReturnValue({
        ...acme, planDisplayName: 'Team', addons: { a: { tier: 't', tierDisplayName: 'Communicate Pro' } },
      })
      await cmd.run()

      expect(json(cmd)).toEqual({
        user: { id: 'u1', name: 'Ada Lovelace' },
        account: { id: 'acc-1', name: 'Acme', plan: 'Team', addons: ['Communicate Pro'] },
        accountSource: 'login',
        defaultAccount: { id: 'acc-1', name: 'Acme' },
        otherAccounts: [{ id: 'acc-2', name: 'Globex' }],
      })
    })

    it('reports a per-command account and no default when none is chosen yet', async () => {
      vi.mocked(config.getCredentialSource).mockReturnValue('account_override')
      const cmd = createCommand('--output', 'json')
      await cmd.run()

      expect(json(cmd)).toMatchObject({ accountSource: 'account_override', defaultAccount: null, otherAccounts: [] })
    })

    it('reports no default for API key credentials, which ignore it', async () => {
      vi.mocked(config.getCredentialSource).mockReturnValue('environment')
      config.data.store = { accountId: 'acc-1', accountName: 'Acme' }
      const cmd = createCommand('--output', 'json')
      await cmd.run()

      expect(json(cmd)).toMatchObject({ accountSource: 'environment', defaultAccount: null })
    })

    it('reports environment credentials', async () => {
      vi.mocked(config.getCredentialSource).mockReturnValue('environment')
      const cmd = createCommand('--output', 'json')
      await cmd.run()

      expect(json(cmd)).toMatchObject({ accountSource: 'environment', account: { plan: null, addons: [] } })
    })
  })
})
