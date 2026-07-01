import axios from 'axios'
import prompts from 'prompts'
import { Command } from '@oclif/core'
import { fileURLToPath } from 'node:url'
import { dirname, relative } from 'node:path'
import { api } from '../rest/api.js'
import { assignProxy } from '../services/proxy.js'
import { CommandStyle } from '../helpers/command-style.js'
import { findStaleSkills } from '../services/skills.js'
import { PackageJsonFile } from '../services/check-parser/package-files/package-json-file.js'
import { detectNearestPackageJson } from '../services/check-parser/package-files/package-manager.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export type BaseCommandClass = typeof Command & {
  coreCommand: boolean
}

export abstract class BaseCommand extends Command {
  static coreCommand = false
  static hidden = true
  static readOnly = false
  static destructive = false
  static idempotent = false
  fancy = true
  style = new CommandStyle(this)
  #packageJsonLoader?: Promise<PackageJsonFile | undefined>

  async loadPackageJsonOfSelf (): Promise<PackageJsonFile | undefined> {
    try {
      if (!this.#packageJsonLoader) {
        this.#packageJsonLoader = detectNearestPackageJson(__dirname)
      }

      return await this.#packageJsonLoader
    } catch {
      return
    }
  }

  async checkEngineCompatibility (): Promise<void> {
    const nodeVersion = process.versions.node
    if (nodeVersion === undefined) {
      // Do nothing if Node version is not present. Note that Bun and Deno
      // do set a value for it though.
      return
    }

    const packageJson = await this.loadPackageJsonOfSelf()
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
      `You are using Node v${nodeVersion}, which is not compatible with `
      + `the Checkly CLI. While you may continue to use the CLI, please be `
      + `advised that some functionality may not function correctly. Please `
      + `update to a newer version as soon as possible.`
      + `\n\n`
      + `We currently support the following versions:`
      + `\n\n`
      + `  ${requirements}`,
    )
  }

  async checkSkillFreshness (): Promise<void> {
    // The `init` and `skills` commands install or refresh skills themselves,
    // so a freshness warning there is either noise or self-contradictory.
    if (this.id === 'init' || this.id?.startsWith('skills')) {
      return
    }

    try {
      const stale = await findStaleSkills(process.cwd())
      if (stale.length === 0) {
        return
      }

      const entries = stale
        .map(({ dir, targetPath }) =>
          `${relative(process.cwd(), targetPath)}\n`
          + `  npx checkly skills install --path ${dir} --force`,
        )
        .join('\n\n')

      this.style.longWarning(
        'Checkly skill is out of date',
        `The installed skill no longer matches this CLI version. `
        + `Re-install to update:\n\n${entries}\n\n`
        + `Had to customize the skill to make it work? Tell us how we can `
        + `improve it — open an issue at `
        + `https://github.com/checkly/checkly-cli/issues`,
      )
    } catch {
      // Never block a command on the freshness check.
    }
  }

  protected async init (): Promise<void> {
    await this.checkEngineCompatibility()
    await this.checkSkillFreshness()

    let version = process.env.CHECKLY_CLI_VERSION ?? this.config.version

    // use latest version from NPM if it's running from the local environment or E2E
    if (version === '0.0.1-dev' || version?.startsWith('0.0.0')) {
      try {
        const registryUrl = 'https://registry.npmjs.org/checkly/latest'
        const { data: packageInformation } = await axios.get(
          registryUrl,
          assignProxy(registryUrl, {}),
        )
        version = packageInformation.version
      } catch {
        // No-op
      }
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

  protected catch (err: Error & { exitCode?: number }): Promise<any> {
    // TODO: we can add Sentry here and log critical errors.
    return super.catch(err)
  }
}
