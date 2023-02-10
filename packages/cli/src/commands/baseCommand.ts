import { Command } from '@oclif/core'
import { api } from '../rest/api'

export abstract class BaseCommand extends Command {
  static hidden = true

  protected init (): Promise<void> {
    // It is otherwise null
    process.exitCode = 0
    api.defaults.headers['x-checkly-cli-version'] = this.config.version
    return super.init()
  }

  async run (): Promise<void> {
    await this.exit(0)
  }

  protected catch (err: Error & {exitCode?: number}): Promise<any> {
    // TODO: we can add Sentry here and log critical errors.
    return super.catch(err)
  }
}
