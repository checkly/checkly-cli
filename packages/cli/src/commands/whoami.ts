import * as api from '../rest/api.js'
import config from '../services/config.js'
import commonMessages from '../messages/common-messages.js'
import { outputFlag } from '../helpers/flags.js'
import { accountOverrideNotice, formatAccounts } from '../helpers/accounts.js'
import { AuthCommand } from './authCommand.js'

export default class Whoami extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'See your currently logged in account and user.'

  static flags = {
    output: outputFlag({ default: 'detail', options: ['detail', 'json'] }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Whoami)
    const account = this.account
    const accountSource = config.getCredentialSource()
    const [{ data: user }, otherAccounts] = await Promise.all([
      api.user.get(),
      accountSource === 'environment' ? [] : this.otherAccounts(),
    ])
    const addonNames = Object.values(account.addons ?? {}).map(a => a.tierDisplayName)
    // API key credentials ignore the stored default, so it says nothing about them.
    const defaultAccount = accountSource === 'environment' ? undefined : config.getStoredAccount()

    if (flags.output === 'json') {
      this.log(JSON.stringify({
        user: { id: user.id, name: user.name },
        account: { id: account.id, name: account.name, plan: account.planDisplayName ?? null, addons: addonNames },
        accountSource,
        // The account `checkly login` stored; none until one is chosen.
        defaultAccount: defaultAccount ?? null,
        otherAccounts,
      }, null, 2))
      return
    }

    this.log(`You are currently on account "${account.name}" (${account.id}) as ${user.name}.`)
    if (defaultAccount) {
      this.log(`Default account: ${formatAccounts([defaultAccount])}`)
    } else if (accountSource === 'account_override') {
      this.log('Default account: none (not needed while `CHECKLY_ACCOUNT_ID` picks the account)')
    } else if (accountSource === 'login') {
      this.log('Default account: none; choose one with `npx checkly login --account-id <id>`')
    }
    if (account.planDisplayName) {
      this.log(`Plan: ${account.planDisplayName}`)
    }
    if (addonNames.length > 0) {
      this.log(`Add-ons: ${addonNames.join(', ')}`)
    }
    if (otherAccounts.length > 0) {
      this.log(`Other accounts: ${formatAccounts(otherAccounts)}`)
    }
    if (accountSource === 'account_override') {
      this.log()
      this.log(`${accountOverrideNotice()} It works with the key of your \`checkly login\` session.`)
    } else if (accountSource === 'environment') {
      this.log()
      this.log(`This account is resolved from your environment, not a \`checkly login\` session. ${commonMessages.envCredentialsConfigured}`)
    }
  }

  /**
   * The user's other accounts, which a login key also works with. The list
   * is only a pointer: not getting it is no reason to fail.
   */
  private async otherAccounts (): Promise<Array<{ id: string, name: string }>> {
    try {
      const { data: accounts } = await api.accounts.getAll()
      return accounts.filter(({ id }) => id !== this.account.id).map(({ id, name }) => ({ id, name }))
    } catch {
      return []
    }
  }
}
