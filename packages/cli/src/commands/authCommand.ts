import { BaseCommand } from './baseCommand'
import * as api from '../rest/api'
import { Account } from '../rest/accounts'
import { configureClient } from '@checkly/public-api-client-preview'
import config from '../services/config'

export abstract class AuthCommand extends BaseCommand {
  static hidden = true

  #account?: Account

  get account (): Account {
    if (this.#account === undefined) {
      throw new Error('This command requires authentication.')
    }

    return this.#account
  }

  protected async init (): Promise<any> {
    super.init()
    this.#account = await api.validateAuthentication()
    configureClient({
      baseURL: config.getApiUrl(),
      token: config.getApiKey(),
      accountId: config.getAccountId(),
      apiVersion: process.env.CHECKLY_API_VERSION,
    })
  }
}
