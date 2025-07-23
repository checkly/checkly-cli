import { AuthCommand } from './authCommand'
import {
  getCiInformation,
  getDefaultChecklyConfig,
  getEnvs,
  getGitInformation,
  splitConfigFilePath, writeChecklyConfigFile
} from '../services/util'
import { getChecklyConfigFile, loadChecklyConfig, PlaywrightSlimmedProp } from '../services/checkly-config-loader'
import { prepareReportersTypes, prepareRunLocation, splitChecklyAndPlaywrightFlags } from '../helpers/test-helper'
import * as api from '../rest/api'
import config from '../services/config'
import { parseProject } from '../services/project-parser'
import type { Runtime } from '../rest/runtimes'
import { Diagnostics, PlaywrightCheck, RuntimeCheck, Session } from '../constructs'
import { Flags, ux } from '@oclif/core'
import { createReporters, ReporterType } from '../reporters/reporter'
import TestRunner from '../services/test-runner'
import { DEFAULT_CHECK_RUN_TIMEOUT_SECONDS, Events, SequenceId } from '../services/abstract-check-runner'
import { TestResultsShortLinks } from '../rest/test-sessions'
import commonMessages from '../messages/common-messages'
import type { Region } from '..'
import path from 'node:path'
import * as recast from 'recast'
import {
  addItemToArray, addOrReplaceItem,
  findPropertyByName,
  reWriteChecklyConfigFile
} from '../helpers/write-config-helpers'
import * as JSON5 from 'json5'
import { detectPackageManager } from '../services/check-parser/package-files/package-manager'
import { DEFAULT_REGION } from '../helpers/constants'
import { cased } from '../sourcegen'

export default class PwTestCommand extends AuthCommand {
  static coreCommand = true
  static hidden = false
  static description = 'Test your Playwright Tests on Checkly.'
  static state = 'beta'
  static flags = {
    'location': Flags.string({
      char: 'l',
      default: DEFAULT_REGION,
      description: 'The location to run the checks at.',
    }),
    'private-location': Flags.string({
      description: 'The private location to run checks at.',
      exclusive: ['location'],
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
    'timeout': Flags.integer({
      default: DEFAULT_CHECK_RUN_TIMEOUT_SECONDS,
      description: 'A timeout (in seconds) to wait for checks to complete.',
    }),
    'verbose': Flags.boolean({
      description: 'Always show the full logs of the checks.',
    }),
    'reporter': Flags.string({
      description: 'A list of custom reporters for the test output.',
      options: ['list', 'dot', 'ci', 'github', 'json'],
    }),
    'config': Flags.string({
      description: commonMessages.configFile,
    }),
    record: Flags.boolean({
      description: 'Record test results in Checkly as a test session with full logs, traces and videos.',
      default: true,
      allowNo: true,
    }),
    'test-session-name': Flags.string({
      description: 'A name to use when storing results in Checkly',
    }),
    'create-check': Flags.boolean({
      description: 'Create a Checkly check from the Playwright test.',
      default: false,
    })
  }

  async run(): Promise<void> {
    this.style.actionStart('Parsing your Playwright project')

    const { checklyFlags, playwrightFlags } = splitChecklyAndPlaywrightFlags(this.argv)

    const { flags } = await this.parse(PwTestCommand, checklyFlags)
    const {
      location: runLocation,
      'private-location': privateRunLocation,
      env = [],
      'env-file': envFile,
      timeout,
      verbose: verboseFlag,
      reporter: reporterFlag,
      config: configFilename,
      record,
      'test-session-name': testSessionName,
      'create-check': createCheck,
    } = flags
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
    } = await loadChecklyConfig(configDirectory, configFilenames, false)
    const playwrightConfigPath = this.getConfigPath(playwrightFlags) ?? checklyConfig.checks?.playwrightConfigPath
    const dir = path.dirname(playwrightConfigPath || '.')
    const playwrightCheck = await PwTestCommand.createPlaywrightCheck(playwrightFlags, runLocation as keyof Region, dir)
    if (createCheck) {
      this.style.actionStart('Creating Checkly check from Playwright test')
      await this.createPlaywrightCheck(playwrightCheck, playwrightConfigPath)
      return
    }


    const location = await prepareRunLocation(checklyConfig.cli, {
      runLocation: runLocation as keyof Region,
      privateRunLocation,
    }, api, config.getAccountId())
    const reporterTypes = prepareReportersTypes(reporterFlag as ReporterType, checklyConfig.cli?.reporters)
    const { data: account } = await api.accounts.get(config.getAccountId())
    const { data: availableRuntimes } = await api.runtimes.getAll()
    const testEnvVars = await getEnvs(envFile, env)


    const project = await parseProject({
      directory: configDirectory,
      projectLogicalId: checklyConfig.logicalId,
      projectName: testSessionName ?? checklyConfig.projectName,
      repoUrl: checklyConfig.repoUrl,
      includeTestOnlyChecks: true,
      availableRuntimes: availableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>> {}),
      defaultRuntimeId: account.runtimeId,
      verifyRuntimeDependencies: false,
      checklyConfigConstructs,
      playwrightConfigPath,
      include: checklyConfig.checks?.include,
      playwrightChecks: [playwrightCheck],
      checkFilter: check => {
        // Skip non Playwright checks
        if (!(check instanceof PlaywrightCheck)) {
          return false
        }
        if (check instanceof RuntimeCheck) {
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
        }
        return true
      }
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

    const checkBundles = Object.values(projectBundle.data.check)

    if (!checkBundles.length) {
      this.log(`Unable to find checks to run`)
      return
    }

    const reporters = createReporters(reporterTypes, location, verboseFlag)
    const repoInfo = getGitInformation(project.repoUrl)
    const ciInfo = getCiInformation()
    // TODO: ADD PROPER RETRY STRATEGY HANDLING
    // const testRetryStrategy = this.prepareTestRetryStrategy(retries, checklyConfig?.cli?.retries)

    const runner = new TestRunner(
      config.getAccountId(),
      projectBundle,
      checkBundles,
      Session.sharedFiles,
      location,
      timeout,
      verboseFlag,
      record,
      repoInfo,
      ciInfo.environment,
      // NO NEED TO UPLOAD SNAPSHOTS FOR PLAYWRIGHT TESTS
      false,
      configDirectory,
      // TODO: ADD PROPER RETRY STRATEGY HANDLING
      null, // testRetryStrategy
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

    static async createPlaywrightCheck(args: string[], runLocation: keyof Region, dir: string): Promise<PlaywrightSlimmedProp> {
      const parseArgs = args.map(arg => {
        if (arg.includes(' ')) {
          arg = `"${arg}"`
        }
        return arg
      })
      const input = parseArgs.join(' ') || ''
      const inputLogicalId = cased(input, 'kebab-case').substring(0, 50)
      const testCommand = await PwTestCommand.getTestCommand(dir, input)
      return {
        logicalId: `playwright-check-${inputLogicalId}`,
        name: `Playwright Test: ${input}`,
        testCommand,
        locations: [runLocation],
        frequency: 10,
      }
  }

  private getConfigPath (playwrightFlags: string[]) {
    for (let i = 0; i < playwrightFlags.length; i++) {
      const arg = playwrightFlags[i]
      if (arg.startsWith('--config') || arg.startsWith('-c')) {
        return arg.includes('=') ? arg.split('=')[1] : playwrightFlags[i + 1]
      }
    }
  }

  private async createPlaywrightCheck (playwrightCheck: PlaywrightSlimmedProp, playwrightConfigPath: string = './playwright.config.ts') {
    const dir = process.cwd()
    const baseName = path.basename(dir)

    const configFile = await getChecklyConfigFile()
    if (!configFile) {
      this.style.shortWarning('No Checkly config file found')
      this.style.shortInfo('Creating a default checkly config file.')
      const checklyConfig = getDefaultChecklyConfig(baseName, `./${path.relative(dir, playwrightConfigPath)}`, playwrightCheck)
      await writeChecklyConfigFile(dir, checklyConfig)
      this.style.actionSuccess()
      return
    }
    const checklyAst = recast.parse(configFile.checklyConfig)
    const checksAst = findPropertyByName(checklyAst, 'checks')
    if (!checksAst) {
      this.style.longError('Unable to automatically sync your config file.', 'This can happen if your Checkly config is ' +
        'built using helper functions or other JS/TS features. You can still manually set Playwright config values in ' +
        'your Checkly config: https://www.checklyhq.com/docs/cli/constructs-reference/#project')

      return
    }
    const b = recast.types.builders;
    const playwrightPropertyNode = b.property(
      'init',
      b.identifier('playwrightConfigPath'),
      b.stringLiteral(playwrightConfigPath)
    );

    const playwrightCheckString = `const playwrightCheck = ${JSON5.stringify(playwrightCheck, { space: 2 })}`
    const playwrightCheckAst = recast.parse(playwrightCheckString)
    const playwrightCheckNode = playwrightCheckAst.program.body[0].declarations[0].init;
    addOrReplaceItem(checksAst.value, playwrightPropertyNode, 'playwrightConfigPath')
    addItemToArray(checksAst.value, playwrightCheckNode, 'playwrightChecks')
    const checklyConfigData = recast.print(checklyAst, { tabWidth: 2 }).code
    const writeDir = path.resolve(path.dirname(configFile.fileName))
    await reWriteChecklyConfigFile(checklyConfigData, configFile.fileName, writeDir)
    this.style.actionSuccess()
    return

  }

  private static async getTestCommand(directoryPath: string, input: string): Promise<string| undefined> {
    const packageManager = await detectPackageManager(directoryPath)
    // Passing the input to the execCommand will return it quoted, which we want to avoid
    return `${packageManager.execCommand(['playwright', 'test']).unsafeDisplayCommand} ${input}`
  }
}
