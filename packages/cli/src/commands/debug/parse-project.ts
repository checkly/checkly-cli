import { Command, Flags } from '@oclif/core'

import { parseProject } from '../../services/project-parser'
import { loadChecklyConfig } from '../../services/checkly-config-loader'
import {
  Diagnostics,
} from '../../constructs'
import { splitConfigFilePath } from '../../services/util'
import commonMessages from '../../messages/common-messages'
import { loadSnapshot, Runtime } from '../../runtimes'

export type ParseProjectOutput = {
  diagnostics: {
    fatal: boolean
    benign: boolean
    observations: {
      title: string
      message: string
      fatal: boolean
      benign: boolean
    }[]
  }
  payload: {
    project: {
      logicalId: string
      name: string
    }
    sharedFiles: {
      path: string
      content: string
    }[]
    resources: {
      logicalId: string
      type: string
      member: boolean
      payload: unknown
    }[]
  }
}

export default class ParseProjectCommand extends Command {
  static hidden = true
  static description = 'Parses a Checkly project.'

  static flags = {
    'config': Flags.string({
      char: 'c',
      description: commonMessages.configFile,
      env: 'CHECKLY_CONFIG_FILE',
    }),
    'default-runtime': Flags.string({
      description: 'The default runtime to use if none is specified.',
      default: '2025.04',
      env: 'CHECKLY_DEFAULT_RUNTIME',
    }),
    'verify-runtime-dependencies': Flags.boolean({
      description: '[default: true] Return an error if checks import dependencies that are not supported by the selected runtime.',
      default: true,
      allowNo: true,
      env: 'CHECKLY_VERIFY_RUNTIME_DEPENDENCIES',
    }),
    'emulate-pw-test': Flags.boolean({
      description: 'Pretend to be the pw-test command. Affects validation.',
      env: 'CHECKLY_EMULATE_PW_TEST',
    }),
    'include': Flags.string({
      description: 'File patterns to include when bundling the test project (e.g., "utils/**/*").',
      multiple: true,
      default: [],
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ParseProjectCommand)
    const {
      config: configFilename,
      'default-runtime': defaultRuntime,
      'verify-runtime-dependencies': verifyRuntimeDependencies,
      'emulate-pw-test': emulatePwTest,
      'include': includeFlag,
    } = flags
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const availableRuntimes = await loadSnapshot()

    try {
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
        defaultRuntimeId: defaultRuntime,
        verifyRuntimeDependencies,
        checklyConfigConstructs,
        playwrightConfigPath: checklyConfig.checks?.playwrightConfigPath,
        include: includeFlag.length ? includeFlag : checklyConfig.checks?.include,
        includeFlagProvided: includeFlag.length > 0,
        playwrightChecks: checklyConfig.checks?.playwrightChecks,
        currentCommand: emulatePwTest ? 'pw-test' : undefined,
      })

      const diagnostics = new Diagnostics()
      await project.validate(diagnostics)

      const bundle = await project.bundle()

      const payload = diagnostics.isFatal() ? null : bundle.synthesize()

      const output = {
        diagnostics: {
          fatal: diagnostics.isFatal(),
          benign: diagnostics.isBenign(),
          observations: diagnostics.observations.map(diag => {
            return {
              title: diag.title,
              message: diag.message,
              fatal: diag.isFatal(),
              benign: diag.isBenign(),
            }
          }),
        },
        payload,
      }

      // eslint-disable-next-line no-console
      console.log(JSON.stringify(output, null, 2))
    } catch (err: any) {
      const output = {
        errors: [{
          name: err.name,
          message: err.message,
        }],
      }

      // eslint-disable-next-line no-console
      console.log(JSON.stringify(output, null, 2))
    }
  }
}
