import axios from 'axios'
import prompts from 'prompts'
import { Command } from '@oclif/core'
import { api } from '../rest/api'

export type BaseCommandClass = typeof Command & {
  coreCommand: boolean
}

export abstract class BaseCommand extends Command {
  static coreCommand = false
  static hidden = true

  protected async init (): Promise<void> {
    let version = process.env.CHECKLY_CLI_VERSION ?? this.config.version

    // use latest version from NPM if it's running from the local environment or E2E
    if (version === '0.0.1-dev') {
      try {
        const { data: packageInformation } = await axios.get('https://registry.npmjs.org/checkly/latest')
        this.log(`\nNotice: replacing version '${version}' with latest '${packageInformation.version}'.\n`)
        version = packageInformation.version
      } catch { }
    }

    api.defaults.headers['x-checkly-cli-version'] = version

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
