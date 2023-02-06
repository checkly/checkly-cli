import { BaseCommand } from './baseCommand'
import config from '../services/config'
import * as api from '../rest/api'

export abstract class AuthCommand extends BaseCommand {
  static hidden = true

  protected async init (): Promise<any> {
    super.init()

    if (!config.hasValidCredentials()) {
      throw new Error('Run `npx checkly login` or manually set `CHECKLY_API_KEY` ' +
        '& `CHECKLY_ACCOUNT_ID` environment variables to setup authentication.')
    }

    const accountId = config.getAccountId()
    const apiKey = config.getApiKey()

    try {
      await api.accounts.get(accountId)
    } catch (err: any) {
      const { status } = err.response
      if (status === 401) {
        throw new Error(`Authentication failed with Account ID "${accountId}" ` +
          `and API key "${apiKey?.substring(0, 8)}..."`)
      }
    }
  }

  protected catch (err: Error & {exitCode?: number}): Promise<any> {
    return super.catch(err)
  }
}
