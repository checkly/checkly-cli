import { BaseCommand } from './baseCommand'
import * as api from '../rest/api'

export abstract class AuthCommand extends BaseCommand {
  static hidden = true

  protected async init (): Promise<any> {
    super.init()
    await api.isAuthenticated()
  }
}
