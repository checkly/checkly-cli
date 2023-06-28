import axios from 'axios'
import { Command } from '@oclif/core'
import { api } from '../rest/api'

export async function getLatestVersion (): Promise<string> {
  try {
    const { data } = await axios.get('https://registry.npmjs.org/checkly/latest')
    return data.version
  } catch {
    return '0.0.1'
  }
}

export type BaseCommandClass = typeof Command & {
  coreCommand: boolean
}

export abstract class BaseCommand extends Command {
  static coreCommand = false
  static hidden = true

  protected async init (): Promise<void> {
    // TODO: find a better way to mock the CLI version for E2E tests.
    api.defaults.headers['x-checkly-cli-version'] = process.env.CHECKLY_CLI_VERSION ?? await getLatestVersion()
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
