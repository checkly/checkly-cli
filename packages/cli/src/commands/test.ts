import * as fs from 'node:fs/promises'
import { Flags, Args } from '@oclif/core'
import { parse } from 'dotenv'
import { isCI } from 'ci-info'
import * as api from '../rest/api'
import config from '../services/config'
import ListReporter from '../reporters/list'
import CiReporter from '../reporters/ci'
import { parseProject } from '../services/project-parser'
import CheckRunner, { Events, RunLocation, PrivateRunLocation } from '../services/check-runner'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { filterByFileNamePattern, filterByCheckNamePattern } from '../services/test-filters'
import type { Runtime } from '../rest/runtimes'
import { AuthCommand } from './authCommand'

const DEFAULT_REGION = 'eu-central-1'

async function getEnvs (envFile: string|undefined, envArgs: Array<string>) {
  if (envFile) {
    const envsString = await fs.readFile(envFile, { encoding: 'utf8' })
    return parse(envsString)
  }
  const envsString = `${envArgs.join('\n')}`
  return parse(envsString)
}

export default class Test extends AuthCommand {
  static hidden = false
  static description = 'Test checks on Checkly'
  static flags = {
    location: Flags.string({
      char: 'l',
      description: 'The location to run the checks at.',
    }),
    'private-location': Flags.string({
      description: 'The private location to run checks at.',
      exclusive: ['location'],
    }),
    grep: Flags.string({
      char: 'g',
      description: 'Only run checks where the check name matches a regular expression.',
      default: '.*',
    }),
    env: Flags.string({
      char: 'e',
      description: 'Env vars to be passed to the test run.',
      exclusive: ['env-file'],
      multiple: true,
      default: [],
    }),
    'env-file': Flags.string({
      description: 'dotenv file path to be passed.',
      exclusive: ['env'],
    }),
    list: Flags.boolean({
      default: false,
      description: 'list all checks but don\'t run them.',
    }),
    timeout: Flags.integer({
      default: 240,
      description: 'A timeout (in seconds) to wait for checks to complete.',
    }),
    verbose: Flags.boolean({
      char: 'v',
      default: false,
      description: 'Always show the logs of the checks.',
    }),
  }

  static args = {
    fileArgs: Args.string({
      name: 'files',
      required: false,
      description: 'Only run checks where the file name matches a regular expression',
      default: '.*',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { flags, argv } = await this.parse(Test)
    const {
      location: runLocation,
      'private-location': privateRunLocation,
      grep,
      env,
      'env-file': envFile,
      list,
      timeout,
      verbose,
    } = flags
    const cwd = process.cwd()
    const filePatterns = argv as string[]

    const testEnvVars = await getEnvs(envFile, env)
    const { config: checklyConfig, constructs: checklyConfigConstructs } = await loadChecklyConfig(cwd)
    const location = await this.prepareRunLocation(checklyConfig.cli, { runLocation, privateRunLocation })
    const { data: availableRuntimes } = await api.runtimes.getAll()
    const project = await parseProject({
      directory: cwd,
      projectLogicalId: checklyConfig.logicalId,
      projectName: checklyConfig.projectName,
      repoUrl: checklyConfig.repoUrl,
      checkMatch: checklyConfig.checks?.checkMatch,
      browserCheckMatch: checklyConfig.checks?.browserChecks?.testMatch,
      ignoreDirectoriesMatch: checklyConfig.checks?.ignoreDirectoriesMatch,
      checkDefaults: checklyConfig.checks,
      browserCheckDefaults: checklyConfig.checks?.browserChecks,
      availableRuntimes: availableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>> {}),
      checklyConfigConstructs,
    })
    const { checks: checksMap, groups: groupsMap } = project.data
    const checks = Object.entries(checksMap)
      .filter(([_, check]) => {
        return filterByFileNamePattern(filePatterns, check.scriptPath) ||
          filterByFileNamePattern(filePatterns, check.__checkFilePath)
      })
      .filter(([_, check]) => {
        return filterByCheckNamePattern(grep, check.name)
      })
      .map(([key, check]) => {
        check.logicalId = key
        if (Object.keys(testEnvVars).length) {
          check.environmentVariables = check.environmentVariables
            ?.filter((envVar: any) => !testEnvVars[envVar.key]) || []
          for (const [key, value] of Object.entries(testEnvVars)) {
            check.environmentVariables.push({
              key,
              value,
              locked: true,
            })
          }
        }
        // TODO: Add the group to check in a cleaner form
        if (check.groupId) {
          check.group = groupsMap[check.groupId.ref]
          delete check.groupId
        }
        return check
      })
    const reporter = isCI ? new CiReporter(location, checks, verbose) : new ListReporter(location, checks, verbose)

    if (list) {
      reporter.onBeginStatic()
      return
    }

    const runner = new CheckRunner(config.getAccountId(), config.getApiKey(), checks, location, timeout, verbose)
    runner.on(Events.RUN_STARTED, () => reporter.onBegin())
    runner.on(Events.CHECK_SUCCESSFUL, (check, result) => {
      if (result.hasFailures) {
        process.exitCode = 1
      }
      reporter.onCheckEnd({
        logicalId: check.logicalId,
        sourceFile: check.sourceFile,
        ...result,
      })
    })
    runner.on(Events.CHECK_FAILED, (check, message) => {
      reporter.onCheckEnd({
        ...check,
        logicalId: check.logicalId,
        sourceFile: check.sourceFile,
        hasFailures: true,
        runError: message,
      })
      process.exitCode = 1
    })
    runner.on(Events.RUN_FINISHED, () => reporter.onEnd())
    await runner.run()
  }

  async prepareRunLocation (
    configOptions: { runLocation?: string, privateRunLocation?: string } = {},
    cliFlags: { runLocation?: string, privateRunLocation?: string },
  ): Promise<RunLocation> {
    // Command line options take precedence
    if (cliFlags.runLocation) {
      const { data: availableLocations } = await api.locations.getAll()
      if (availableLocations.some(l => l.region === cliFlags.runLocation)) {
        return { type: 'PUBLIC', region: cliFlags.runLocation }
      }
      throw new Error(`Unable to run checks on unsupported location "${cliFlags.runLocation}". ` +
        `Supported locations are:\n${availableLocations.map(l => `${l.region}`).join('\n')}`)
    } else if (cliFlags.privateRunLocation) {
      return this.preparePrivateRunLocation(cliFlags.privateRunLocation)
    } else if (configOptions.runLocation && configOptions.privateRunLocation) {
      throw new Error('Both runLocation and privateRunLocation fields were set in the Checkly config file.' +
        ` Please only specify one run location. The configured locations were' + 
        ' "${configOptions.runLocation}" and "${configOptions.privateRunLocation}"`)
    } else if (configOptions.runLocation) {
      return { type: 'PUBLIC', region: configOptions.runLocation }
    } else if (configOptions.privateRunLocation) {
      return this.preparePrivateRunLocation(configOptions.privateRunLocation)
    } else {
      return { type: 'PUBLIC', region: DEFAULT_REGION }
    }
  }

  async preparePrivateRunLocation (privateLocationSlugName: string): Promise<PrivateRunLocation> {
    try {
      const { data: privateLocations } = await api.privateLocations.getAll()
      const privateLocation = privateLocations.find(({ slugName }) => slugName === privateLocationSlugName)
      if (privateLocation) {
        return { type: 'PRIVATE', id: privateLocation.id, slugName: privateLocationSlugName }
      }
      const { data: account } = await api.accounts.get(config.getAccountId())
      throw new Error(`The specified private location "${privateLocationSlugName}" was not found on account "${account.name}".`)
    } catch (err: any) {
      throw new Error(`Failed to get private locations. ${err.message}.`)
    }
  }
}
