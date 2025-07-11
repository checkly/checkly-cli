import { valueForAlertChannelFromId } from '../constructs/alert-channel-codegen'
import { valueForAlertEscalation } from '../constructs/alert-escalation-policy-codegen'
import { valueForFrequency } from '../constructs/frequency-codegen'
import { Context } from '../constructs/internal/codegen'
import { valueForKeyValuePair } from '../constructs/key-value-pair-codegen'
import { valueForPlaywrightConfig } from '../constructs/playwright-config-codegen'
import { valueForPrivateLocationFromId } from '../constructs/private-location-codegen'
import { valueForRetryStrategy } from '../constructs/retry-strategy-codegen'
import { array, decl, docComment, expr, GeneratedFile, ident, ObjectValueBuilder, Program, StringValue } from '../sourcegen'
import { ChecklyConfig, CheckConfigDefaults } from './checkly-config-loader'

function buildCheckConfigDefaults (
  program: Program,
  file: GeneratedFile,
  context: Context,
  builder: ObjectValueBuilder,
  resource: CheckConfigDefaults,
) {
  if (resource.activated !== undefined) {
    builder.boolean('activated', resource.activated)
  }

  if (resource.muted !== undefined) {
    builder.boolean('muted', resource.muted)
  }

  if (resource.doubleCheck !== undefined) {
    builder.boolean('doubleCheck', resource.doubleCheck)
  }

  if (resource.shouldFail !== undefined) {
    builder.boolean('shouldFail', resource.shouldFail)
  }

  if (resource.runtimeId !== undefined) {
    builder.string('runtimeId', resource.runtimeId)
  }

  if (resource.locations !== undefined) {
    const locations = resource.locations
    builder.array('locations', builder => {
      for (const location of locations) {
        builder.string(location)
      }
    })
  }

  if (resource.tags !== undefined) {
    const tags = resource.tags
    builder.array('tags', builder => {
      for (const location of tags) {
        builder.string(location)
      }
    })
  }

  if (resource.frequency !== undefined) {
    builder.value('frequency', valueForFrequency(file, resource.frequency))
  }

  if (resource.environmentVariables !== undefined) {
    const environmentVariables = resource.environmentVariables
    builder.array('environmentVariables', builder => {
      for (const variable of environmentVariables) {
        builder.value(valueForKeyValuePair(program, file, context, variable))
      }
    })
  }

  if (resource.alertChannels !== undefined) {
    const alertChannels = resource.alertChannels
    builder.array('alertChannels', builder => {
      for (const alertChannel of alertChannels) {
        if (alertChannel.physicalId !== undefined && typeof alertChannel.physicalId === 'number') {
          builder.value(valueForAlertChannelFromId(file, alertChannel.physicalId))
          continue
        }

        throw new Error(`Unable to generate configuration code for Alert Channel '${alertChannel.logicalId}'`)
      }
    })
  }

  if (resource.privateLocations !== undefined) {
    const locations = resource.privateLocations
    builder.array('privateLocations', builder => {
      for (const location of locations) {
        if (typeof location === 'string') {
          builder.string(location)
          continue
        }

        if (location.physicalId !== undefined && typeof location.physicalId === 'string') {
          builder.value(valueForPrivateLocationFromId(file, location.physicalId))
          continue
        }

        throw new Error(`Unable to generate configuration code for Private Location '${location.logicalId}'`)
      }
    })
  }

  if (resource.retryStrategy !== undefined) {
    builder.value('retryStrategy', valueForRetryStrategy(file, resource.retryStrategy))
  }

  if (resource.alertEscalationPolicy !== undefined) {
    builder.value('alertEscalationPolicy', valueForAlertEscalation(file, resource.alertEscalationPolicy))
  }

  if (resource.playwrightConfig !== undefined) {
    builder.value('playwrightConfig', valueForPlaywrightConfig(resource.playwrightConfig))
  }
}

function valueForStringOrStringArray (value: string | string[]) {
  if (Array.isArray(value)) {
    return array(builder => {
      for (const match of value) {
        builder.string(match)
      }
    })
  } else {
    return new StringValue(value)
  }
}

export function generateChecklyConfig (
  program: Program,
  context: Context,
  config: ChecklyConfig,
  filename: string,
): void {
  const file = program.generatedSupportFile(filename)

  file.header(docComment(`\
This is a Checkly configuration file.

See {@link https://www.checklyhq.com/docs/cli/project-structure/} for
more information.`))

  file.namedImport('defineConfig', 'checkly')

  file.section(decl(ident('config'), builder => {
    builder.variable(expr(ident('defineConfig'), builder => {
      builder.call(builder => {
        builder.object(builder => {
          builder.string('projectName', config.projectName)
          builder.string('logicalId', config.logicalId)

          if (config.repoUrl !== undefined) {
            builder.string('repoUrl', config.repoUrl)
          }

          if (config.checks !== undefined) {
            const checks = config.checks
            builder.object('checks', builder => {
              if (checks.checkMatch !== undefined) {
                builder.value('checkMatch', valueForStringOrStringArray(checks.checkMatch))
              }

              if (checks.ignoreDirectoriesMatch !== undefined) {
                const ignoreDirectoriesMatch = checks.ignoreDirectoriesMatch
                builder.array('ignoreDirectoriesMatch', builder => {
                  for (const match of ignoreDirectoriesMatch) {
                    builder.string(match)
                  }
                })
              }

              buildCheckConfigDefaults(program, file, context, builder, checks)

              if (checks.browserChecks !== undefined) {
                const browserChecks = checks.browserChecks
                builder.object('browserChecks', builder => {
                  if (browserChecks.testMatch !== undefined) {
                    builder.value('testMatch', valueForStringOrStringArray(browserChecks.testMatch))
                  }

                  buildCheckConfigDefaults(program, file, context, builder, browserChecks)
                })
              }

              if (checks.multiStepChecks !== undefined) {
                const multiStepChecks = checks.multiStepChecks
                builder.object('multiStepChecks', builder => {
                  if (multiStepChecks.testMatch !== undefined) {
                    builder.value('testMatch', valueForStringOrStringArray(multiStepChecks.testMatch))
                  }

                  buildCheckConfigDefaults(program, file, context, builder, multiStepChecks)
                })
              }
            })
          }

          if (config.cli !== undefined) {
            const cli = config.cli
            builder.object('cli', builder => {
              if (cli.runLocation !== undefined) {
                builder.string('runLocation', cli.runLocation)
              }

              if (cli.privateRunLocation !== undefined) {
                builder.string('privateRunLocation', cli.privateRunLocation)
              }

              if (cli.verbose !== undefined) {
                builder.boolean('verbose', cli.verbose)
              }

              if (cli.reporters !== undefined) {
                const reporters = cli.reporters
                builder.array('reporters', builder => {
                  for (const reporter of reporters) {
                    builder.string(reporter)
                  }
                })
              }

              if (cli.retries !== undefined) {
                builder.number('retries', cli.retries)
              }
            })
          }
        })
      })
    }))
  }))

  file.section(decl(ident('config'), builder => {
    builder.export({
      default: true,
    })
  }))
}
