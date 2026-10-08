import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  accounts: { get: vi.fn(), getAll: vi.fn() },
}))
vi.mock('../../helpers/activate-account', () => ({ activateAccount: vi.fn() }))
vi.mock('prompts', () => ({ default: vi.fn() }))
vi.mock('../../helpers/cli-mode', () => ({ detectCliMode: vi.fn(() => 'interactive') }))

import prompts from 'prompts'
import * as api from '../../rest/api.js'
import { activateAccount } from '../../helpers/activate-account.js'
import { detectCliMode } from '../../helpers/cli-mode.js'
import Switch from '../switch.js'

const mockConfig = {
  version: '1.0.0',
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand (...argv: string[]) {
  const cmd = new Switch(argv, mockConfig)
  cmd.log = vi.fn() as any
  cmd.exit = vi.fn((code: number) => {
    throw new Error(`EXIT_${code}`)
  }) as any
  return cmd
}

describe('checkly switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(activateAccount).mockResolvedValue(undefined)
  })

  it('activates the account given by --account-id with its name', async () => {
    vi.mocked(api.accounts.get).mockResolvedValue({ data: { id: 'acc-2', name: 'Globex' } } as any)
    const cmd = createCommand('--account-id', 'acc-2')

    await expect(cmd.run()).rejects.toThrow('EXIT_0')

    expect(activateAccount).toHaveBeenCalledWith({ id: 'acc-2', name: 'Globex' })
    expect(vi.mocked(cmd.log).mock.calls.join('\n')).toContain('Globex')
  })

  it('reports why activating the account failed instead of claiming it does not exist', async () => {
    vi.mocked(api.accounts.get).mockResolvedValue({ data: { id: 'acc-2', name: 'Globex' } } as any)
    vi.mocked(activateAccount).mockRejectedValue(new Error('Service Unavailable'))
    const cmd = createCommand('--account-id', 'acc-2')

    await expect(cmd.run()).rejects.toThrow('Failed to switch account. Service Unavailable')
    expect(cmd.log).not.toHaveBeenCalled()
  })

  describe('right after the login this run did', () => {
    function loggedInCommand () {
      const cmd = createCommand()
      ;(cmd as any).loggedInInline = true
      Object.defineProperty(cmd, 'account', { get: () => ({ id: 'acc-1', name: 'Acme' }) })
      return cmd
    }

    it('names the account the login chose instead of asking again', async () => {
      const cmd = loggedInCommand()

      await cmd.run()

      expect(prompts).not.toHaveBeenCalled()
      expect(api.accounts.getAll).not.toHaveBeenCalled()
      expect(activateAccount).not.toHaveBeenCalled()
      expect(vi.mocked(cmd.log).mock.calls.join('\n')).toContain('Acme')
    })

    it('stays quiet in agent mode, where the login already reported the account', async () => {
      vi.mocked(detectCliMode).mockReturnValueOnce('agent')
      const cmd = loggedInCommand()

      await cmd.run()

      expect(prompts).not.toHaveBeenCalled()
      expect(cmd.log).not.toHaveBeenCalled()
    })
  })

  it('says when the account does not exist', async () => {
    vi.mocked(api.accounts.get).mockRejectedValue(new Error('Not Found'))
    const cmd = createCommand('--account-id', 'nope')

    await expect(cmd.run()).rejects.toThrow('Failed to find an account corresponding to account id nope')
    expect(activateAccount).not.toHaveBeenCalled()
  })

  it('activates the account chosen from the list', async () => {
    vi.mocked(api.accounts.getAll).mockResolvedValue({
      data: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
    } as any)
    vi.mocked(prompts).mockResolvedValue({ selectedAccount: { id: 'acc-2', name: 'Globex' } })
    const cmd = createCommand()

    await cmd.run()

    expect(activateAccount).toHaveBeenCalledWith({ id: 'acc-2', name: 'Globex' })
  })
})
