import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  accounts: { getAll: vi.fn() },
  user: { get: vi.fn() },
}))
vi.mock('../../services/config', () => ({
  default: {
    hasAccountOverride: vi.fn(),
    hasEnvVarsConfigured: vi.fn(),
    data: { get: vi.fn() },
  },
}))

import * as api from '../../rest/api.js'
import config from '../../services/config.js'
import Whoami from '../whoami.js'

const acme = { id: 'acc-1', name: 'Acme', runtimeId: '2025.04' }

function createCommand () {
  const cmd = new Whoami([], { version: '1.0.0', runHook: vi.fn() } as any)
  vi.spyOn(cmd, 'account', 'get').mockReturnValue(acme)
  cmd.log = vi.fn() as any
  return cmd
}

function output (cmd: Whoami): string {
  return vi.mocked(cmd.log).mock.calls.map(([line]) => String(line ?? '')).join('\n')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.user.get).mockResolvedValue({ data: { name: 'Ada Lovelace' } } as any)
  vi.mocked(api.accounts.getAll).mockResolvedValue({ data: [acme] } as any)
  vi.mocked(config.hasAccountOverride).mockReturnValue(false)
  vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(false)
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
    vi.stubEnv('CHECKLY_API_KEY', 'cu_env')
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(true)
    const cmd = createCommand()
    await cmd.run()

    expect(api.accounts.getAll).not.toHaveBeenCalled()
    expect(output(cmd)).toContain('resolved from your environment')
  })

  it('still answers when the accounts cannot be listed', async () => {
    vi.mocked(api.accounts.getAll).mockRejectedValue(new Error('boom'))
    const cmd = createCommand()
    await cmd.run()

    expect(output(cmd)).toContain('You are currently on account "Acme"')
  })

  it('says CHECKLY_ACCOUNT_ID picks the account for this command only, naming the default', async () => {
    vi.mocked(config.hasAccountOverride).mockReturnValue(true)
    vi.mocked(config.hasEnvVarsConfigured).mockReturnValue(true)
    vi.mocked(config.data.get).mockReturnValue('Globex')
    const cmd = createCommand()
    await cmd.run()

    expect(output(cmd)).toContain('`CHECKLY_ACCOUNT_ID` selects this account for this command only')
    expect(output(cmd)).toContain('Your default account is "Globex".')
    expect(output(cmd)).not.toContain('resolved from your environment')
  })

  it('says how to choose a default when none is set', async () => {
    vi.mocked(config.hasAccountOverride).mockReturnValue(true)
    vi.mocked(config.data.get).mockReturnValue(undefined)
    const cmd = createCommand()
    await cmd.run()

    expect(output(cmd)).toContain('No default account is set; choose one with `npx checkly login --account-id <id>`.')
  })
})
