import * as api from '../rest/api'
import { AuthCommand } from './authCommand'

export default class Whoami extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'See your currently logged in account and user.'
  async run (): Promise<void> {
    const account = this.account
    const { data: user } = await api.user.get()
    this.log(`You are currently on account "${account.name}" (${account.id}) as ${user.name}.`)
  }
}
