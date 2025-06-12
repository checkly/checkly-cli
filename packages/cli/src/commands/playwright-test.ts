import { getCiInformation, getGitInformation, splitConfigFilePath } from '../services/util'
import { loadChecklyConfig, PlaywrightSlimmedProp } from '../services/checkly-config-loader'
import { createReporters } from '../reporters/reporter'
import config from '../services/config'
import Test from './test'
import * as api from '../rest/api'
import type { Region } from '..'
import { parseProject } from '../services/project-parser'
import type { Runtime } from '../rest/runtimes'
import {  Diagnostics } from '../constructs'
import { ux } from '@oclif/core'
import TestRunner from '../services/test-runner'
import { Events, SequenceId } from '../services/abstract-check-runner'
import { TestResultsShortLinks } from '../rest/test-sessions'

const DEFAULT_REGION = 'eu-central-1'
export default class PlaywrightTest extends Test {
  static strict = false; // allow unknown flags
  static description = 'Run Playwright tests using Checkly CLI'
  async run(): Promise<void> {
    this.style.actionStart('Parsing your project')
    const rawArgs = this.argv || []
    const input = rawArgs.join(' ') || ''
    const { configDirectory, configFilenames } = splitConfigFilePath()
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const location = await this.prepareRunLocation(checklyConfig.cli, {
      runLocation: DEFAULT_REGION as keyof Region,
      privateRunLocation: undefined,
    })

    console.log(input)
    const { data: account } = await api.accounts.get(config.getAccountId())
    const { data: availableRuntimes } = await api.runtimes.getAll()
    const playWrightChecks: PlaywrightSlimmedProp = {
      logicalId: 'playwright-check',
      name: `Playwright Test: ${input}`,
      testCommand: `npx playwright test ${input}`,
      locations: [DEFAULT_REGION],
    }
    const project = await parseProject({
      directory: configDirectory,
      projectLogicalId: checklyConfig.logicalId,
      projectName: checklyConfig.projectName,
      repoUrl: checklyConfig.repoUrl,
      includeTestOnlyChecks: true,
      ignoreDirectoriesMatch: checklyConfig.checks?.ignoreDirectoriesMatch,
      checkDefaults: checklyConfig.checks,
      availableRuntimes: availableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>> {}),
      defaultRuntimeId: account.runtimeId,
      playwrightConfigPath: checklyConfig.checks?.playwrightConfigPath,
      include: checklyConfig.checks?.include,
      playwrightChecks: [playWrightChecks],
      checkFilter: check => { return true }})
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

    const checkBundles = Object.values(projectBundle.data.check)

    if (this.fancy) {
      ux.action.stop()
    }

    // if (!checkBundles.length) {
    //   this.log(`Unable to find checks to run${filePatterns[0] !== '.*' ? ' using [FILEARGS]=\'' + filePatterns + '\'' : ''}.`)
    //   return
    // }
    //
    // if (list) {
    //   this.listChecks(checkBundles.map(({ construct }) => construct))
    //   return
    // }
    const reporterTypes = this.prepareReportersTypes('list', checklyConfig.cli?.reporters)

    const reporters = createReporters(reporterTypes, location, false)
    const repoInfo = getGitInformation(project.repoUrl)
    const ciInfo = getCiInformation()

    const runner = new TestRunner(
      config.getAccountId(),
      projectBundle,
      checkBundles,
      location,
      10000,
      false,
      true,
      repoInfo,
      ciInfo.environment,
      false,
      configDirectory,
      null,
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
}
