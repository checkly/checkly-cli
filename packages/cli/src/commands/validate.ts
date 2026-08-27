import * as api from '../rest/api.js'
import { Flags } from '@oclif/core'
import { AuthCommand } from './authCommand.js'
import { parseProject } from '../services/project-parser.js'
import { loadChecklyConfig } from '../services/checkly-config-loader.js'
import { splitConfigFilePath } from '../services/util.js'
import commonMessages from '../messages/common-messages.js'
import { Runtime } from '../runtimes/index.js'

export default class Validate extends AuthCommand {
  static coreCommand = true
  static hidden = true // Expose when validation is more thorough.
  static readOnly = true
  static idempotent = true
  static description = 'Validate your project.'

  static flags = {
    'config': Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    'verify-runtime-dependencies': Flags.boolean({
      description: '[default: true] Return an error if checks import dependencies that are not supported by the selected runtime.',
      default: true,
      allowNo: true,
      env: 'CHECKLY_VERIFY_RUNTIME_DEPENDENCIES',
    }),
  }

  async run (): Promise<void> {
    this.style.actionStart('Parsing your project')
    const { flags } = await this.parse(Validate)
    const {
      config: configFilename,
      'verify-runtime-dependencies': verifyRuntimeDependencies,
    } = flags
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
      diagnostics: configDiagnostics,
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const account = this.account
    const availableRuntimes = await api.runtimes.getAll()
    const project = await parseProject({
      directory: configDirectory,
      projectLogicalId: checklyConfig.logicalId,
      projectName: checklyConfig.projectName,
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
      defaultRuntimeId: account.runtimeId,
      verifyRuntimeDependencies,
      checklyConfigConstructs,
      playwrightConfigPath: checklyConfig.checks?.playwrightConfigPath,
      include: checklyConfig.checks?.include,
      embeddedPackages: checklyConfig.bundle?.packages?.embed,
      playwrightChecks: checklyConfig.checks?.playwrightChecks,
    })

    this.style.actionSuccess()

    await this.validateProject(project, {
      configDiagnostics,
      failureMessage: `Your project is not valid.`,
    })

    this.style.shortSuccess(`Your project is valid.`)
  }
}
