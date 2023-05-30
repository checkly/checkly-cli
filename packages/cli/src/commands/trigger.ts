import { Flags } from '@oclif/core'
import { isCI } from 'ci-info'

import * as api from '../rest/api'
import { AuthCommand } from './authCommand'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { splitConfigFilePath, getEnvs, getGitInformation, getCiInformation } from '../services/util'
import type { Region } from '..'
import TriggerRunner, { NoMatchingChecksError } from '../services/trigger-runner'
import { RunLocation, Events, PrivateRunLocation, CheckRunId } from '../services/abstract-check-runner'
import config from '../services/config'
import { createReporters, ReporterType } from '../reporters/reporter'
import { TestResultsShortLinks } from '../rest/test-sessions'

const DEFAULT_REGION = 'eu-central-1'

export default class Trigger extends AuthCommand {
  static coreCommand = true
  static hidden = false
  static description = 'Trigger your checks on Checkly.'
  static flags = {
    location: Flags.string({
      char: 'l',
      description: 'The location to run the checks at.',
    }),
    'private-location': Flags.string({
      description: 'The private location to run checks at.',
      exclusive: ['location'],
    }),
    tags: Flags.string({
      char: 't',
      description: 'Filter the checks to be run using a comma separated list of tags.' +
        ' Checks will only be run if they contain all of the specified tags.' +
        ' Multiple --tags flags can be passed, in which case checks will be run if they match any of the --tags filters.' +
        ' F.ex. `--tags production,webapp --tags production,backend` will run checks with tags (production AND webapp) OR (production AND backend).',
      multiple: true,
      required: false,
    }),
    config: Flags.string({
      char: 'c',
      description: 'The Checkly CLI config filename.',
    }),
    timeout: Flags.integer({
      default: 240,
      description: 'A timeout (in seconds) to wait for checks to complete.',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Always show the full logs of the checks.',
      allowNo: true,
    }),
    reporter: Flags.string({
      char: 'r',
      description: 'A list of custom reporters for the test output.',
      options: ['list', 'dot', 'ci', 'github'],
    }),
    env: Flags.string({
      char: 'e',
      description: 'Env vars to be passed to the check run.',
      exclusive: ['env-file'],
      multiple: true,
      default: [],
    }),
    'env-file': Flags.string({
      description: 'dotenv file path to be passed. For example --env-file="./.env"',
      exclusive: ['env'],
    }),
    record: Flags.boolean({
      description: 'Record check results in Checkly as a test session with full logs, traces and videos.',
      default: false,
    }),
    'test-session-name': Flags.string({
      char: 'n',
      description: 'A name to use when storing results in Checkly with --record.',
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Trigger)
    const {
      location: runLocation,
      'private-location': privateRunLocation,
      config: configFilename,
      tags: targetTags,
      timeout,
      verbose: verboseFlag,
      record: shouldRecord,
      reporter: reporterFlag,
      env,
      'env-file': envFile,
      'test-session-name': testSessionName,
    } = flags
    const envVars = await getEnvs(envFile, env)
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)

    let checklyConfig
    try {
      const { config } = await loadChecklyConfig(configDirectory, configFilenames)
      checklyConfig = config
    } catch (err) {} // Don't throw an error if the config file is missing
    const location = await this.prepareRunLocation(checklyConfig?.cli, {
      runLocation: runLocation as keyof Region,
      privateRunLocation,
    })
    const verbose = this.prepareVerboseFlag(verboseFlag, checklyConfig?.cli?.verbose)
    const reporterTypes = this.prepareReportersTypes(reporterFlag as ReporterType, checklyConfig?.cli?.reporters)
    const reporters = createReporters(reporterTypes, location, verbose)

    const repoInfo = getGitInformation()
    const ciInfo = getCiInformation()

    const runner = new TriggerRunner(
      config.getAccountId(),
      timeout,
      verbose,
      shouldRecord,
      location,
      targetTags?.map((tags: string) => tags.split(',')) ?? [],
      Object.entries(envVars).map(([key, value]) => ({ key, value })),
      repoInfo,
      ciInfo.environment,
      testSessionName,
    )
    // TODO: This is essentially the same for `checkly test`. Maybe reuse code.
    runner.on(Events.RUN_STARTED,
      (checks: Array<{ check: any, checkRunId: CheckRunId, testResultId?: string }>, testSessionId: string) =>
        reporters.forEach(r => r.onBegin(checks, testSessionId)))
    runner.on(Events.CHECK_SUCCESSFUL, (checkRunId, _, result, links?: TestResultsShortLinks) => {
      if (result.hasFailures) {
        process.exitCode = 1
      }
      reporters.forEach(r => r.onCheckEnd(checkRunId, result, links))
    })
    runner.on(Events.CHECK_FAILED, (checkRunId, check, message: string) => {
      reporters.forEach(r => r.onCheckEnd(checkRunId, {
        ...check,
        hasFailures: true,
        runError: message,
      }))
      process.exitCode = 1
    })
    runner.on(Events.RUN_FINISHED, () => reporters.forEach(r => r.onEnd()),
    )
    runner.on(Events.ERROR, (err) => {
      if (err instanceof NoMatchingChecksError) {
        // For consistency with `checkly test`, we log a message and exit with code 0.
        this.log('No matching checks were found.')
        return
      }
      reporters.forEach(r => r.onError(err))
      process.exitCode = 1
    })
    await runner.run()
  }

  // TODO: Reuse prepare* methods from the `checkly test command`
  async prepareRunLocation (
    configOptions: { runLocation?: keyof Region, privateRunLocation?: string } = {},
    cliFlags: { runLocation?: keyof Region, privateRunLocation?: string } = {},
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

  prepareVerboseFlag (verboseFlag?: boolean, cliVerboseFlag?: boolean) {
    return verboseFlag ?? cliVerboseFlag ?? false
  }

  prepareReportersTypes (reporterFlag: ReporterType, cliReporters: ReporterType[] = []): ReporterType[] {
    if (!reporterFlag && !cliReporters.length) {
      return [isCI ? 'ci' : 'list']
    }
    return reporterFlag ? [reporterFlag] : cliReporters
  }
}
