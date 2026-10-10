import * as api from '../rest/api.js'
import config from '../services/config.js'
import commonMessages from '../messages/common-messages.js'
import { AuthCommand } from './authCommand.js'

export default class Whoami extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'See your currently logged in account and user.'
  async run (): Promise<void> {
    const account = this.account
    const { data: user } = await api.user.get()
    this.log(`You are currently on account "${account.name}" (${account.id}) as ${user.name}.`)
    if (account.planDisplayName) {
      this.log(`Plan: ${account.planDisplayName}`)
    }
    const addons = account.addons ?? {}
    const addonNames = Object.values(addons).map(a => a.tierDisplayName)
    if (addonNames.length > 0) {
      this.log(`Add-ons: ${addonNames.join(', ')}`)
    }
    const otherAccounts = await this.otherAccounts()
    if (otherAccounts.length > 0) {
      this.log(`Other accounts: ${otherAccounts.map(({ id, name }) => `"${name}" (${id})`).join(', ')}`)
    }
    if (config.hasAccountOverride()) {
      const defaultName = config.data.get('accountName') as string | undefined
      this.log()
      this.log('`CHECKLY_ACCOUNT_ID` selects this account for this command only, with the key of your '
        + '`checkly login` session. '
        + (defaultName
          ? `Your default account is "${defaultName}".`
          : 'No default account is set; choose one with `npx checkly login --account-id <id>`.'))
    } else if (config.hasEnvVarsConfigured()) {
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
      return accounts.filter(({ id }) => id !== this.account.id)
    } catch {
      return []
    }
  }
}
