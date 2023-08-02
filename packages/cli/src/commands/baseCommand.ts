import * as prompts from 'prompts'
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

    // This overrides prompts answers/selections (used on E2E tests)
    if (process.env.CHECKLY_E2E_PROMPTS_INJECTIONS) {
      try {
        const injections = JSON.parse(process.env.CHECKLY_E2E_PROMPTS_INJECTIONS)
        prompts.inject(injections)
      } catch {
        process.stderr.write('Error parsing CHECKLY_E2E_PROMPTS_INJECTIONS environment variable for injections.')
      }
    }

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
