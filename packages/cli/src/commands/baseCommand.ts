import { Command } from '@oclif/core'
import { api } from '../rest/api'

export type BaseCommandClass = typeof Command & {
  coreCommand: boolean
}

export abstract class BaseCommand extends Command {
  static coreCommand = false
  static hidden = true

  protected init (): Promise<void> {
    // TODO: find a better way to mock the CLI version for E2E tests.
    api.defaults.headers['x-checkly-cli-version'] = process.env.CHECKLY_CLI_VERSION ?? this.config.version
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
