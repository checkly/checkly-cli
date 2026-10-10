import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  accounts: { get: vi.fn(), getAll: vi.fn() },
}))
vi.mock('../../helpers/activate-account', () => ({ activateAccount: vi.fn() }))
vi.mock('prompts', () => ({ default: vi.fn() }))
vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'interactive'),
  isPersonAtTerminal: vi.fn(() => true),
}))
vi.mock('../../services/config', () => ({
  default: {
    data: { store: {} as Record<string, unknown> },
    getCredentialSource: vi.fn(() => 'login'),
    getAccountId: vi.fn(),
  },
}))

import prompts from 'prompts'
import * as api from '../../rest/api.js'
import { activateAccount } from '../../helpers/activate-account.js'
import { detectCliMode, isPersonAtTerminal } from '../../helpers/cli-mode.js'
import config from '../../services/config.js'
import Switch from '../switch.js'

const mockConfig = {
  version: '1.0.0',
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand (...argv: string[]) {
  const cmd = new Switch(argv, mockConfig)
  cmd.log = vi.fn() as any
  cmd.warn = vi.fn() as any
  cmd.exit = vi.fn((code: number) => {
    throw new Error(`EXIT_${code}`)
  }) as any
  return cmd
}

describe('checkly switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(activateAccount).mockResolvedValue(undefined)
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(isPersonAtTerminal).mockReturnValue(true)
    vi.mocked(config.getCredentialSource).mockReturnValue('login')
    config.data.store = { accountId: 'acc-1', accountName: 'Acme' }
  })

  it('warns that CHECKLY_ACCOUNT_ID still picks the account after switching the default', async () => {
    vi.mocked(config.getCredentialSource).mockReturnValue('account_override')
    vi.mocked(config.getAccountId).mockReturnValue('acc-3')
    vi.mocked(api.accounts.get).mockResolvedValue({ data: { id: 'acc-2', name: 'Globex' } } as any)
    const cmd = createCommand('--account-id', 'acc-2')

    await expect(cmd.run()).rejects.toThrow('EXIT_0')

    expect(activateAccount).toHaveBeenCalledWith({ id: 'acc-2', name: 'Globex' })
    expect(cmd.warn).toHaveBeenCalledWith(expect.stringContaining('`CHECKLY_ACCOUNT_ID` is set to "acc-3"'))
  })

  it('does not warn without CHECKLY_ACCOUNT_ID', async () => {
    vi.mocked(api.accounts.get).mockResolvedValue({ data: { id: 'acc-2', name: 'Globex' } } as any)
    const cmd = createCommand('--account-id', 'acc-2')

    await expect(cmd.run()).rejects.toThrow('EXIT_0')

    expect(cmd.warn).not.toHaveBeenCalled()
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

  describe('without a person at a terminal to answer the menu', () => {
    function commandOnAcme (account = { id: 'acc-1', name: 'Acme' }) {
      vi.mocked(api.accounts.getAll).mockResolvedValue({
        data: [{ id: 'acc-1', name: 'Acme', runtimeId: 'x' }, { id: 'acc-2', name: 'Globex', runtimeId: 'x' }],
      } as any)
      const cmd = createCommand()
      Object.defineProperty(cmd, 'account', { get: () => account })
      return cmd
    }

    it('lists the accounts to an agent as select_account instead of drawing the menu', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      const cmd = commandOnAcme()

      await expect(cmd.run()).rejects.toThrow('EXIT_1')

      expect(prompts).not.toHaveBeenCalled()
      expect(activateAccount).not.toHaveBeenCalled()
      const [line] = vi.mocked(cmd.log).mock.calls.map(([msg]) => JSON.parse(String(msg)))
      expect(line).toEqual({
        status: 'action_required',
        reason: 'select_account',
        userActionRequired: true,
        message: expect.stringContaining('The default account is "Acme". Ask the user which account to switch to'),
        defaultAccount: { id: 'acc-1', name: 'Acme' },
        choices: [{ id: 'acc-1', name: 'Acme' }, { id: 'acc-2', name: 'Globex' }],
        next: [
          { command: 'npx checkly switch --account-id <id>', when: 'to make the account the default' },
          { command: 'CHECKLY_ACCOUNT_ID=<id> npx checkly <command>', when: 'to use the account for this command only' },
        ],
      })
    })

    it('reports the stored default, not the account CHECKLY_ACCOUNT_ID picks for this command', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      vi.mocked(config.getCredentialSource).mockReturnValue('account_override')
      vi.mocked(config.getAccountId).mockReturnValue('acc-2')
      // The account in use for this command is the one the variable picks.
      const cmd = commandOnAcme({ id: 'acc-2', name: 'Globex' })

      await expect(cmd.run()).rejects.toThrow('EXIT_1')

      const [line] = vi.mocked(cmd.log).mock.calls.map(([msg]) => JSON.parse(String(msg)))
      expect(line.defaultAccount).toEqual({ id: 'acc-1', name: 'Acme' })
      expect(line.message).toContain('The default account is "Acme".')
      expect(line.message).toContain('`CHECKLY_ACCOUNT_ID` is set to "acc-2"')
    })

    it('says when no default account is set', async () => {
      vi.mocked(detectCliMode).mockReturnValue('agent')
      config.data.store = {}
      const cmd = commandOnAcme()

      await expect(cmd.run()).rejects.toThrow('EXIT_1')

      const [line] = vi.mocked(cmd.log).mock.calls.map(([msg]) => JSON.parse(String(msg)))
      expect(line.defaultAccount).toBeNull()
      expect(line.message).toMatch(/^No default account is set\./)
    })

    it('fails with the accounts and the flag to use in CI', async () => {
      vi.mocked(detectCliMode).mockReturnValue('ci')
      const cmd = commandOnAcme()

      await expect(cmd.run()).rejects.toThrow(
        'Choose one with `npx checkly switch --account-id <id>`. Available: Acme (acc-1), Globex (acc-2)')
      expect(prompts).not.toHaveBeenCalled()
    })

    it('fails the same way in interactive mode without a terminal', async () => {
      vi.mocked(isPersonAtTerminal).mockReturnValue(false)
      const cmd = commandOnAcme()

      await expect(cmd.run()).rejects.toThrow('needs a terminal to ask which account to use')
      expect(prompts).not.toHaveBeenCalled()
      expect(activateAccount).not.toHaveBeenCalled()
    })
  })
})
