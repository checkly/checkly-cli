import axios from 'axios'
import prompts from 'prompts'
import { Command } from '@oclif/core'
import { api } from '../rest/api'
import { CommandStyle } from '../helpers/command-style'
import { PackageFilesResolver } from '../services/check-parser/package-files/resolver'

export type BaseCommandClass = typeof Command & {
  coreCommand: boolean
}

export abstract class BaseCommand extends Command {
  static coreCommand = false
  static hidden = true
  fancy = true
  style = new CommandStyle(this)

  checkEngineCompatibility (): void {
    const nodeVersion = process.versions.node
    if (nodeVersion === undefined) {
      // Do nothing if Node version is not present. Note that Bun and Deno
      // do set a value for it though.
      return
    }

    const resolver = new PackageFilesResolver()
    const packageJson = resolver.loadPackageJsonFile(__filename)
    if (packageJson === undefined) {
      // Do nothing if there's no package.json.
      return
    }

    const {
      incompatible,
      requirements,
    } = packageJson.supportsEngine('node', nodeVersion)

    if (!incompatible) {
      // Do nothing if not incompatible.
      return
    }

    this.style.longWarning(
      `Unsupported Node version`,
      `You are using Node v${nodeVersion}, which is not compatible with ` +
      `the Checkly CLI. While you may continue to use the CLI, please be ` +
      `advised that some functionality may not function correctly. Please ` +
      `update to a newer version as soon as possible.` +
      `\n\n` +
      `We currently support the following versions:` +
      `\n\n` +
      `  ${requirements}`,
    )
  }

  protected async init (): Promise<void> {
    this.checkEngineCompatibility()

    let version = process.env.CHECKLY_CLI_VERSION ?? this.config.version

    // use latest version from NPM if it's running from the local environment or E2E
    if (version === '0.0.1-dev' || version?.startsWith('0.0.0')) {
      try {
        const { data: packageInformation } = await axios.get('https://registry.npmjs.org/checkly/latest')
        this.log(`\nNotice: replacing version '${version}' with latest '${packageInformation.version}'. If you wish to test with a different version, please pass the CHECKLY_CLI_VERSION environment variable.\n`)
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

    if (process.env.CHECKLY_E2E_DISABLE_FANCY_OUTPUT) {
      this.fancy = false
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
