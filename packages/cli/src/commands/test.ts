import { Flags, Args, ux } from '@oclif/core'
import indentString from 'indent-string'
import { isCI } from 'ci-info'
import * as api from '../rest/api'
import config from '../services/config'
import { parseProject } from '../services/project-parser'
import {
  Events,
  RunLocation,
  PrivateRunLocation,
  SequenceId,
  DEFAULT_CHECK_RUN_TIMEOUT_SECONDS,
} from '../services/abstract-check-runner'
import TestRunner from '../services/test-runner'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { filterByFileNamePattern, filterByCheckNamePattern, filterByTags } from '../services/test-filters'
import type { Runtime } from '../rest/runtimes'
import { AuthCommand } from './authCommand'
import { BrowserCheck, Check, HeartbeatCheck, MultiStepCheck, Project, RetryStrategyBuilder, Session } from '../constructs'
import type { Region } from '..'
import { splitConfigFilePath, getGitInformation, getCiInformation, getEnvs } from '../services/util'
import { createReporters, ReporterType } from '../reporters/reporter'
import commonMessages from '../messages/common-messages'
import { TestResultsShortLinks } from '../rest/test-sessions'
import { printLn, formatCheckTitle, CheckStatus } from '../reporters/util'
import { uploadSnapshots } from '../services/snapshot-service'

const DEFAULT_REGION = 'eu-central-1'
const MAX_RETRIES = 3

export default class Test extends AuthCommand {
  static coreCommand = true
  static hidden = false
  static description = 'Test your checks on Checkly.'
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
    tags: Flags.string({
      char: 't',
      description: 'Filter the checks to be run using a comma separated list of tags.' +
        ' Checks will only be run if they contain all of the specified tags.' +
        ' Multiple --tags flags can be passed, in which case checks will be run if they match any of the --tags filters.' +
        ' F.ex. `--tags production,webapp --tags production,backend` will run checks with tags (production AND webapp) OR (production AND backend).',
      multiple: true,
      required: false,
    }),
    env: Flags.string({
      char: 'e',
      description: 'Env vars to be passed to the test run.',
      exclusive: ['env-file'],
      multiple: true,
      default: [],
    }),
    'env-file': Flags.string({
      description: 'dotenv file path to be passed. For example --env-file="./.env"',
      exclusive: ['env'],
    }),
    list: Flags.boolean({
      default: false,
      description: 'list all checks but don\'t run them.',
    }),
    timeout: Flags.integer({
      default: DEFAULT_CHECK_RUN_TIMEOUT_SECONDS,
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
      options: ['list', 'dot', 'ci', 'github', 'json'],
    }),
    config: Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    record: Flags.boolean({
      description: 'Record test results in Checkly as a test session with full logs, traces and videos.',
      default: false,
    }),
    'test-session-name': Flags.string({
      char: 'n',
      description: 'A name to use when storing results in Checkly with --record.',
    }),
    'update-snapshots': Flags.boolean({
      char: 'u',
      description: 'Update any snapshots using the actual result of this test run.',
      default: false,
    }),
    retries: Flags.integer({
      description: `[default: 0, max: ${MAX_RETRIES}] How many times to retry a failing test run.`,
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
    ux.action.start('Parsing your project', undefined, { stdout: true })

    const { flags, argv } = await this.parse(Test)
    const {
      location: runLocation,
      'private-location': privateRunLocation,
      grep,
      tags: targetTags,
      env,
      'env-file': envFile,
      list,
      timeout,
      verbose: verboseFlag,
      reporter: reporterFlag,
      config: configFilename,
      record: shouldRecord,
      'test-session-name': testSessionName,
      'update-snapshots': updateSnapshots,
      retries,
    } = flags
    const filePatterns = argv as string[]

    const testEnvVars = await getEnvs(envFile, env)
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const location = await this.prepareRunLocation(checklyConfig.cli, {
      runLocation: runLocation as keyof Region,
      privateRunLocation,
    })
    const verbose = this.prepareVerboseFlag(verboseFlag, checklyConfig.cli?.verbose)
    const reporterTypes = this.prepareReportersTypes(reporterFlag as ReporterType, checklyConfig.cli?.reporters)
    const { data: availableRuntimes } = await api.runtimes.getAll()

    const project = await parseProject({
      directory: configDirectory,
      projectLogicalId: checklyConfig.logicalId,
      projectName: testSessionName ?? checklyConfig.projectName,
      repoUrl: checklyConfig.repoUrl,
      checkMatch: checklyConfig.checks?.checkMatch,
      browserCheckMatch: checklyConfig.checks?.browserChecks?.testMatch,
      multiStepCheckMatch: checklyConfig.checks?.multiStepChecks?.testMatch,
      ignoreDirectoriesMatch: checklyConfig.checks?.ignoreDirectoriesMatch,
      checkDefaults: checklyConfig.checks,
      browserCheckDefaults: checklyConfig.checks?.browserChecks,
      availableRuntimes: availableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>> {}),
      checklyConfigConstructs,
    })
    const checks = Object.entries(project.data.check)
      .filter(([, check]) => {
        return !(check instanceof HeartbeatCheck)
      })
      .filter(([, check]) => {
        if (check instanceof BrowserCheck || check instanceof MultiStepCheck) {
          return filterByFileNamePattern(filePatterns, check.scriptPath) ||
            filterByFileNamePattern(filePatterns, check.__checkFilePath)
        } else {
          return filterByFileNamePattern(filePatterns, check.__checkFilePath)
        }
      })
      .filter(([, check]) => {
        return filterByCheckNamePattern(grep, check.name)
      })
      .filter(([, check]) => {
        const tags = check.tags ?? []
        const checkGroup = this.getCheckGroup(project, check)
        if (checkGroup) {
          const checkGroupTags = checkGroup.tags ?? []
          tags.concat(checkGroupTags)
        }
        return filterByTags(targetTags?.map((tags: string) => tags.split(',')) ?? [], tags)
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
        return check
      })

    for (const check of checks) {
      if (!(check instanceof BrowserCheck)) {
        continue
      }
      check.snapshots = await uploadSnapshots(check.rawSnapshots)
    }

    ux.action.stop()

    if (!checks.length) {
      this.log(`Unable to find checks to run${filePatterns[0] !== '.*' ? ' using [FILEARGS]=\'' + filePatterns + '\'' : ''}.`)
      return
    }

    if (list) {
      this.listChecks(checks)
      return
    }

    const reporters = createReporters(reporterTypes, location, verbose)
    const repoInfo = getGitInformation(project.repoUrl)
    const ciInfo = getCiInformation()
    const testRetryStrategy = this.prepareTestRetryStrategy(retries, checklyConfig?.cli?.retries)

    const runner = new TestRunner(
      config.getAccountId(),
      project,
      checks,
      location,
      timeout,
      verbose,
      shouldRecord,
      repoInfo,
      ciInfo.environment,
      updateSnapshots,
      configDirectory,
      testRetryStrategy,
    )

    runner.on(Events.RUN_STARTED,
      (checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId: string) =>
        reporters.forEach(r => r.onBegin(checks, testSessionId)),
    )

    runner.on(Events.CHECK_INPROGRESS, (check: any, sequenceId: SequenceId) => {
      reporters.forEach(r => r.onCheckInProgress(check, sequenceId))
    })

    runner.on(Events.MAX_SCHEDULING_DELAY_EXCEEDED, () => {
      reporters.forEach(r => r.onSchedulingDelayExceeded())
    })

    runner.on(Events.CHECK_ATTEMPT_RESULT, (sequenceId: SequenceId, check, result, links?: TestResultsShortLinks) => {
      reporters.forEach(r => r.onCheckAttemptResult(sequenceId, {
        logicalId: check.logicalId,
        sourceFile: check.getSourceFile(),
        ...result,
      }, links))
    })

    runner.on(Events.CHECK_SUCCESSFUL,
      (sequenceId: SequenceId, check, result, testResultId, links?: TestResultsShortLinks) => {
        if (result.hasFailures) {
          process.exitCode = 1
        }

        reporters.forEach(r => r.onCheckEnd(sequenceId, {
          logicalId: check.logicalId,
          sourceFile: check.getSourceFile(),
          ...result,
        }, testResultId, links))
      })

    runner.on(Events.CHECK_FAILED, (sequenceId: SequenceId, check, message: string) => {
      reporters.forEach(r => r.onCheckEnd(sequenceId, {
        ...check,
        logicalId: check.logicalId,
        sourceFile: check.getSourceFile(),
        hasFailures: true,
        runError: message,
      }))
      process.exitCode = 1
    })
    runner.on(Events.RUN_FINISHED, () => reporters.forEach(r => r.onEnd()))
    runner.on(Events.ERROR, (err) => {
      reporters.forEach(r => r.onError(err))
      process.exitCode = 1
    })
    await runner.run()
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
      throw new Error('Both runLocation and privateRunLocation fields were set in your Checkly config file.' +
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
      const privateLocations = await Session.getPrivateLocations()
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

  prepareTestRetryStrategy (retries?: number, configRetries?: number) {
    const numRetries = retries ?? configRetries ?? 0
    if (numRetries > MAX_RETRIES) {
      printLn(`Defaulting to the maximum of ${MAX_RETRIES} retries.`)
    }
    return numRetries
      ? RetryStrategyBuilder.fixedStrategy({
        maxRetries: Math.min(numRetries, MAX_RETRIES),
        baseBackoffSeconds: 0,
      })
      : null
  }

  private listChecks (checks: Array<Check>) {
    // Sort and print the checks in a way that's consistent with AbstractListReporter
    const sortedCheckFiles = [...new Set(checks.map((check) => check.getSourceFile()))].sort()
    const sortedChecks = checks.sort((a, b) => a.name.localeCompare(b.name))
    const checkFilesMap: Map<string, Array<Check>> = new Map(sortedCheckFiles.map((file) => [file!, []]))
    sortedChecks.forEach(check => {
      checkFilesMap.get(check.getSourceFile()!)!.push(check)
    })
    printLn('Listing all checks:', 2, 1)
    for (const [sourceFile, checks] of checkFilesMap) {
      printLn(sourceFile)
      for (const check of checks) {
        printLn(indentString(formatCheckTitle(CheckStatus.RUNNING, check), 2))
      }
    }
  }

  private getCheckGroup (project: Project, check: Check) {
    if (!check.groupId) {
      return
    }
    const ref = check.groupId.ref.toString()
    return project.data['check-group'][ref]
  }
}
