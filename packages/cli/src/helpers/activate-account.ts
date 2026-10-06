import config from '../services/config.js'
import * as api from '../rest/api.js'
import commonMessages from '../messages/common-messages.js'

/**
 * Makes `account` the active account and checks that the stored credentials
 * work with it. If they do not, the previously active account stays active.
 * `checkly login` and `checkly switch` both select accounts through this.
 */
export async function activateAccount (account: { id: string, name: string }): Promise<void> {
  // Credentials from the environment take precedence over the stored account,
  // so the switch could neither take effect nor be validated.
  if (config.hasEnvVarsConfigured()) {
    throw new Error(`${commonMessages.envCredentialsConfigured} Unset them to switch the stored account.`)
  }
  const previous = config.data.store
  config.data.set('accountId', account.id)
  config.data.set('accountName', account.name)
  try {
    await api.validateAuthentication()
  } catch (error) {
    config.data.store = previous
    throw error
  }
}
