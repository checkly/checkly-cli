import config from '../services/config.js'
import * as api from '../rest/api.js'

/**
 * Makes `account` the active account and checks that the stored credentials
 * work with it. If they do not, the previously active account stays active.
 * `checkly login` and `checkly switch` both select accounts through this.
 *
 * While CHECKLY_API_KEY or CHECKLY_ACCOUNT_ID is set, it takes precedence
 * over the stored value: the account is still stored for later, but the
 * check uses the environment's key or account, so it cannot tell whether the
 * stored key works with the stored account.
 */
export async function activateAccount (account: { id: string, name: string }): Promise<void> {
  const previous = config.data.store
  config.data.set('accountId', account.id)
  config.data.set('accountName', account.name)
  try {
    await api.validateAuthentication({ suggestLogin: false })
  } catch (error) {
    config.data.store = previous
    throw error
  }
}
