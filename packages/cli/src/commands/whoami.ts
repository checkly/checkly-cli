import config from '../services/config'
import * as api from '../rest/api'
import { AuthCommand } from './authCommand'

export default class Whoami extends AuthCommand {
  static hidden = false
  static description = 'See your logged account and user'
  async run (): Promise<void> {
    const { data: account } = await api.accounts.get(config.getAccountId())
    const { data: user } = await api.user.get()
    this.log(`You are currently on account "${account.name}" (${account.id}) as ${user.name}.`)
  }
}
