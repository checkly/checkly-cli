import { Command } from '@oclif/core'
import { api } from '../rest/api'

export abstract class BaseCommand extends Command {
  static hidden = true

  protected init (): Promise<void> {
    api.defaults.headers['x-checkly-cli-version'] = this.config.version
    return super.init()
  }

  async run (): Promise<void> {
    await this.exit(0)
  }

  protected catch (err: Error & {exitCode?: number}): Promise<any> {
    // this.error(err, { exit: 1 })
    return super.catch(err)
  }
}
