import config from '../services/config.js'
import * as api from '../rest/api.js'

/**
 * Makes `account` the stored default and checks that the stored credentials
 * work with it. If they do not, the previous default stays.
 * `checkly login` and `checkly switch` both select accounts through this.
 *
 * The check names the account itself, so a `CHECKLY_ACCOUNT_ID` in the
 * environment (which still takes precedence for every command) does not
 * decide whether the new default is accepted.
 */
export async function activateAccount (account: { id: string, name: string }): Promise<void> {
  const previous = config.data.store
  config.data.set('accountId', account.id)
  config.data.set('accountName', account.name)
  try {
    await api.validateAuthentication({ suggestLogin: false, accountId: account.id })
  } catch (error) {
    config.data.store = previous
    throw error
  }
}
