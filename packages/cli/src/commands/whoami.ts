import * as api from '../rest/api.js'
import config from '../services/config.js'
import commonMessages from '../messages/common-messages.js'
import { outputFlag } from '../helpers/flags.js'
import { AuthCommand } from './authCommand.js'

/**
 * Where the account of this run comes from: the default `checkly login`
 * stored, `CHECKLY_ACCOUNT_ID` with the stored login key (this command
 * only), or credentials from the environment.
 */
type AccountSource = 'login' | 'account_override' | 'environment'

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
    const { data: user } = await api.user.get()
    const otherAccounts = await this.otherAccounts()
    const accountSource: AccountSource = config.hasAccountOverride()
      ? 'account_override'
      : config.hasEnvVarsConfigured() ? 'environment' : 'login'
    const addonNames = Object.values(account.addons ?? {}).map(a => a.tierDisplayName)

    if (flags.output === 'json') {
      const defaultAccountId = config.data.get('accountId') as string | undefined
      this.log(JSON.stringify({
        user: { id: user.id, name: user.name },
        account: { id: account.id, name: account.name, plan: account.planDisplayName ?? null, addons: addonNames },
        accountSource,
        // The account `checkly login` stored; none until one is chosen.
        defaultAccount: defaultAccountId
          ? { id: defaultAccountId, name: config.data.get('accountName') ?? null }
          : null,
        otherAccounts,
      }, null, 2))
      return
    }

    this.log(`You are currently on account "${account.name}" (${account.id}) as ${user.name}.`)
    if (account.planDisplayName) {
      this.log(`Plan: ${account.planDisplayName}`)
    }
    if (addonNames.length > 0) {
      this.log(`Add-ons: ${addonNames.join(', ')}`)
    }
    if (otherAccounts.length > 0) {
      this.log(`Other accounts: ${otherAccounts.map(({ id, name }) => `"${name}" (${id})`).join(', ')}`)
    }
    if (accountSource === 'account_override') {
      const defaultName = config.data.get('accountName') as string | undefined
      this.log()
      this.log('`CHECKLY_ACCOUNT_ID` selects this account for this command only, with the key of your '
        + '`checkly login` session. '
        + (defaultName
          ? `Your default account is "${defaultName}".`
          : 'No default account is set; choose one with `npx checkly login --account-id <id>`.'))
    } else if (accountSource === 'environment') {
      this.log()
      this.log(`This account is resolved from your environment, not a \`checkly login\` session. ${commonMessages.envCredentialsConfigured}`)
    }
  }

  /**
   * The user's other accounts, which a login key also works with. Keys from
   * `CHECKLY_API_KEY` belong to one account, so there are none to list. The
   * list is only a pointer: not getting it is no reason to fail.
   */
  private async otherAccounts (): Promise<Array<{ id: string, name: string }>> {
    if (process.env.CHECKLY_API_KEY) {
      return []
    }
    try {
      const { data: accounts } = await api.accounts.getAll()
      return accounts.filter(({ id }) => id !== this.account.id).map(({ id, name }) => ({ id, name }))
    } catch {
      return []
    }
  }
}
