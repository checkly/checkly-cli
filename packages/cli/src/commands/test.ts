import { Flags, Args, ux } from '@oclif/core'
import indentString from 'indent-string'
import * as api from '../rest/api'
import config from '../services/config'
import { parseProject } from '../services/project-parser'
import {
  Events,
  SequenceId,
  DEFAULT_CHECK_RUN_TIMEOUT_SECONDS,
} from '../services/abstract-check-runner'
import TestRunner from '../services/test-runner'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { filterByFileNamePattern, filterByCheckNamePattern, filterByTags } from '../services/test-filters'
import { AuthCommand } from './authCommand'
import { BrowserCheck, Check, Diagnostics, HeartbeatMonitor, MultiStepCheck, Project, RetryStrategyBuilder, RuntimeCheck, Session } from '../constructs'
import type { Region } from '..'
import { splitConfigFilePath, getGitInformation, getCiInformation, getEnvs } from '../services/util'
import { createReporters, ReporterType } from '../reporters/reporter'
import commonMessages from '../messages/common-messages'
import { TestResultsShortLinks } from '../rest/test-sessions'
import { printLn, formatCheckTitle, CheckStatus } from '../reporters/util'
import { uploadSnapshots } from '../services/snapshot-service'
import { isEntrypoint } from '../constructs/construct'
import { BrowserCheckBundle } from '../constructs/browser-check-bundle'
import { prepareReportersTypes, prepareRunLocation } from '../helpers/test-helper'
import { PlaywrightCheckLocalBundle } from '../constructs/playwright-check-bundle'
import { Runtime } from '../runtimes'

const MAX_RETRIES = 3

export default class Test extends AuthCommand {
  static coreCommand = true
  static hidden = false
  static description = 'Test your checks on Checkly.'
  static flags = {
    'location': Flags.string({
      char: 'l',
      description: 'The location to run the checks at.',
    }),
    'private-location': Flags.string({
      description: 'The private location to run checks at.',
      exclusive: ['location'],
    }),
    'grep': Flags.string({
      char: 'g',
      description: 'Only run checks where the check name matches a regular expression.',
      default: '.*',
    }),
    'tags': Flags.string({
      char: 't',
      description: 'Filter the checks to be run using a comma separated list of tags.'
        + ' Checks will only be run if they contain all of the specified tags.'
        + ' Multiple --tags flags can be passed, in which case checks will be run if they match any of the --tags filters.'
        + ' F.ex. `--tags production,webapp --tags production,backend` will run checks with tags (production AND webapp) OR (production AND backend).',
      multiple: true,
      required: false,
    }),
    'env': Flags.string({
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
    'list': Flags.boolean({
      default: false,
      description: 'list all checks but don\'t run them.',
    }),
    'timeout': Flags.integer({
      default: DEFAULT_CHECK_RUN_TIMEOUT_SECONDS,
      description: 'A timeout (in seconds) to wait for checks to complete.',
    }),
    'verbose': Flags.boolean({
      char: 'v',
      description: 'Always show the full logs of the checks.',
      allowNo: true,
    }),
    'reporter': Flags.string({
      char: 'r',
      description: 'A list of custom reporters for the test output.',
      options: ['list', 'dot', 'ci', 'github', 'json'],
    }),
    'config': Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    'record': Flags.boolean({
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
    'retries': Flags.integer({
      description: `[default: 0, max: ${MAX_RETRIES}] How many times to retry a failing test run.`,
    }),
    'verify-runtime-dependencies': Flags.boolean({
      description: '[default: true] Return an error if checks import dependencies that are not supported by the selected runtime.',
      default: true,
      allowNo: true,
      env: 'CHECKLY_VERIFY_RUNTIME_DEPENDENCIES',
    }),
    'refresh-cache': Flags.boolean({
      description: 'Force a fresh install of dependencies and update the cached version.',
      default: false,
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
    this.style.actionStart('Parsing your project')

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
      'verify-runtime-dependencies': verifyRuntimeDependencies,
      'refresh-cache': refreshCache,
    } = flags
    const filePatterns = argv as string[]

    const testEnvVars = await getEnvs(envFile, env)
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
    } = await loadChecklyConfig(configDirectory, configFilenames)

    const location = await prepareRunLocation(checklyConfig.cli, {
      runLocation: runLocation as keyof Region,
      privateRunLocation,
    },
    api,
    config.getAccountId())
    const verbose = this.prepareVerboseFlag(verboseFlag, checklyConfig.cli?.verbose)
    const reporterTypes = prepareReportersTypes(reporterFlag as ReporterType, checklyConfig.cli?.reporters)
    const account = this.account
    const availableRuntimes = await api.runtimes.getAll()

    const project = await parseProject({
      directory: configDirectory,
      projectLogicalId: checklyConfig.logicalId,
      projectName: testSessionName ?? checklyConfig.projectName,
      repoUrl: checklyConfig.repoUrl,
      includeTestOnlyChecks: true,
      checkMatch: checklyConfig.checks?.checkMatch,
      browserCheckMatch: checklyConfig.checks?.browserChecks?.testMatch,
      multiStepCheckMatch: checklyConfig.checks?.multiStepChecks?.testMatch,
      ignoreDirectoriesMatch: checklyConfig.checks?.ignoreDirectoriesMatch,
      checkDefaults: checklyConfig.checks,
      browserCheckDefaults: checklyConfig.checks?.browserChecks,
      availableRuntimes: availableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>>{}),
      defaultRuntimeId: account.runtimeId,
      verifyRuntimeDependencies,
      checklyConfigConstructs,
      playwrightConfigPath: checklyConfig.checks?.playwrightConfigPath,
      include: checklyConfig.checks?.include,
      playwrightChecks: checklyConfig.checks?.playwrightChecks,
      checkFilter: check => {
        if (check instanceof HeartbeatMonitor) {
          return false
        }

        let entrypointMatch = false
        if (check instanceof BrowserCheck || check instanceof MultiStepCheck) {
          // For historical reasons the path used for filtering has always
          // been relative to the project base path.
          const relativeEntrypoint = isEntrypoint(check.code)
            ? Session.relativePosixPath(check.code.entrypoint)
            : undefined

          if (relativeEntrypoint) {
            if (filterByFileNamePattern(filePatterns, relativeEntrypoint)) {
              entrypointMatch = true
            }
          }
        }

        if (!entrypointMatch && !filterByFileNamePattern(filePatterns, check.getSourceFile())) {
          return false
        }

        if (!filterByCheckNamePattern(grep, check.name)) {
          return false
        }

        const tags = [...check.tags ?? []]
        const checkGroup = this.getCheckGroup(project, check)
        if (checkGroup) {
          const checkGroupTags = checkGroup.tags ?? []
          tags.push(...checkGroupTags)
        }
        if (!filterByTags(targetTags?.map((tags: string) => tags.split(',')) ?? [], tags)) {
          return false
        }

        // FIXME: This should not be done here (not related to filtering).
        if (Object.keys(testEnvVars).length) {
          if (check instanceof RuntimeCheck) {
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
        }

        return true
      },
    })

    this.style.actionSuccess()

    this.style.actionStart('Validating project resources')

    const diagnostics = new Diagnostics()
    await project.validate(diagnostics)

    for (const diag of diagnostics.observations) {
      if (diag.isFatal()) {
        this.style.longError(diag.title, diag.message)
      } else if (!diag.isBenign()) {
        this.style.longWarning(diag.title, diag.message)
      } else {
        this.style.longInfo(diag.title, diag.message)
      }
    }

    if (diagnostics.isFatal()) {
      this.style.actionFailure()
      this.style.shortError(`Unable to continue due to unresolved validation errors.`)
      this.exit(1)
    }

    this.style.actionSuccess()

    this.style.actionStart('Bundling project resources')
    const projectBundle = await (async () => {
      try {
        const bundle = await project.bundle()
        this.style.actionSuccess()
        return bundle
      } catch (err) {
        this.style.actionFailure()
        throw err
      }
    })()

    const bundledChecksByType = {
      playwright: [] as string[],
      browser: [] as string[],
    }

    for (const [logicalId, { bundle }] of Object.entries(projectBundle.data.check)) {
      if (bundle instanceof BrowserCheckBundle) {
        bundledChecksByType.browser.push(logicalId)
      } else if (bundle instanceof PlaywrightCheckLocalBundle) {
        bundledChecksByType.playwright.push(logicalId)
      }
    }

    if (bundledChecksByType.browser.length) {
      this.style.actionStart('Uploading Playwright snapshots')
      try {
        for (const logicalId of bundledChecksByType.browser) {
          const bundle = projectBundle.data.check[logicalId].bundle as BrowserCheckBundle
          bundle.snapshots = await uploadSnapshots(bundle.rawSnapshots)
        }
        this.style.actionSuccess()
      } catch (err) {
        this.style.actionFailure()
        throw err
      }
    }

    if (bundledChecksByType.playwright.length) {
      this.style.actionStart('Uploading Playwright code bundles')
      try {
        for (const logicalId of bundledChecksByType.playwright) {
          const resourceData = projectBundle.data.check[logicalId]
          const bundle = resourceData.bundle as PlaywrightCheckLocalBundle
          resourceData.bundle = await bundle.store()
        }
        this.style.actionSuccess()
      } catch (err) {
        this.style.actionFailure()
        throw err
      }
    }

    if (this.fancy) {
      ux.action.stop()
    }

    const checkBundles = Object.values(projectBundle.data.check)

    if (!checkBundles.length) {
      this.log(`Unable to find checks to run${filePatterns[0] !== '.*' ? ' using [FILEARGS]=\'' + filePatterns + '\'' : ''}.`)
      return
    }

    if (list) {
      this.listChecks(checkBundles.map(({ construct }) => construct))
      return
    }

    const reporters = createReporters(reporterTypes, location, verbose)
    const repoInfo = getGitInformation(project.repoUrl)
    const ciInfo = getCiInformation()
    const testRetryStrategy = this.prepareTestRetryStrategy(retries, checklyConfig?.cli?.retries)

    const runner = new TestRunner(
      config.getAccountId(),
      projectBundle,
      checkBundles,
      Session.sharedFiles,
      location,
      timeout,
      verbose,
      shouldRecord,
      repoInfo,
      ciInfo.environment,
      updateSnapshots,
      configDirectory,
      testRetryStrategy,
      undefined,
      refreshCache,
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
    runner.on(Events.ERROR, err => {
      reporters.forEach(r => r.onError(err))
      process.exitCode = 1
    })
    await runner.run()
  }

  prepareVerboseFlag (verboseFlag?: boolean, cliVerboseFlag?: boolean) {
    return verboseFlag ?? cliVerboseFlag ?? false
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
    const sortedCheckFiles = [...new Set(checks.map(check => check.getSourceFile()))].sort()
    const sortedChecks = checks.sort((a, b) => a.name.localeCompare(b.name))
    const checkFilesMap: Map<string, Array<Check>> = new Map(sortedCheckFiles.map(file => [file!, []]))
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
