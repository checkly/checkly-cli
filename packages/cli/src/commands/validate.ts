import * as api from '../rest/api'
import config from '../services/config'
import { Flags } from '@oclif/core'
import { AuthCommand } from './authCommand'
import { parseProject } from '../services/project-parser'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import type { Runtime } from '../rest/runtimes'
import { Diagnostics } from '../constructs'
import { splitConfigFilePath } from '../services/util'
import commonMessages from '../messages/common-messages'

export default class Validate extends AuthCommand {
  static coreCommand = true
  static hidden = true // Expose when validation is more thorough.
  static description = 'Validate your project.'

  static flags = {
    config: Flags.string({
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
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const { data: account } = await api.accounts.get(config.getAccountId())
    const { data: avilableRuntimes } = await api.runtimes.getAll()
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
      monitorDefaults: checklyConfig.checks?.monitors,
      availableRuntimes: avilableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>> {}),
      defaultRuntimeId: account.runtimeId,
      verifyRuntimeDependencies,
      checklyConfigConstructs,
      playwrightConfigPath: checklyConfig.checks?.playwrightConfigPath,
      include: checklyConfig.checks?.include,
      playwrightChecks: checklyConfig.checks?.playwrightChecks,
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
      this.style.shortError(`Your project is not valid.`)
      this.exit(1)
    }

    this.style.actionSuccess()

    this.style.shortSuccess(`Your project is valid.`)
  }
}
