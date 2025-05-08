import { Codegen, Context } from './internal/codegen'
import { decl, expr, GeneratedFile, ident, object, ObjectValueBuilder, Program, Value } from '../sourcegen'
import { AlertEscalationResource, valueForAlertEscalation } from './alert-escalation-policy-codegen'
import { ApiCheckDefaultConfig } from './api-check'
import { valueForAssertion } from './api-check-codegen'
import { EnvironmentVariable } from './environment-variable'
import { FrequencyResource, valueForFrequency } from './frequency-codegen'
import { valueForKeyValuePair } from './key-value-pair-codegen'
import { RetryStrategyResource, valueForRetryStrategy } from './retry-strategy-codegen'
import { valueForPrivateLocationFromId } from './private-location-codegen'
import { valueForAlertChannelFromId } from './alert-channel-codegen'

export interface BrowserCheckConfigResource {
  testMatch: string | string[]
  frequency?: FrequencyResource
}

export interface MultiStepCheckConfigResource {
  testMatch: string | string[]
  frequency?: FrequencyResource
}

export interface CheckGroupResource {
  id: number
  name: string
  activated?: boolean
  muted?: boolean
  doubleCheck?: boolean
  runtimeId?: string
  locations?: string[]
  tags?: string[]
  concurrency?: number
  frequency?: FrequencyResource
  environmentVariables?: EnvironmentVariable[]
  browserChecks?: BrowserCheckConfigResource
  multiStepChecks?: MultiStepCheckConfigResource
  alertSettings?: AlertEscalationResource
  localSetupScript?: string
  localTearDownScript?: string
  apiCheckDefaults?: ApiCheckDefaultConfig
  retryStrategy?: RetryStrategyResource
  runParallel?: boolean
}

function buildCheckGroupProps (
  program: Program,
  genfile: GeneratedFile,
  builder: ObjectValueBuilder,
  resource: CheckGroupResource,
  context: Context,
): void {
  builder.string('name', resource.name)

  if (resource.activated !== undefined) {
    builder.boolean('activated', resource.activated)
  }

  if (resource.muted !== undefined) {
    builder.boolean('muted', resource.muted)
  }

  if (resource.runtimeId) {
    builder.string('runtimeId', resource.runtimeId)
  }

  if (resource.locations) {
    const locations = resource.locations
    if (locations.length > 0) {
      builder.array('locations', builder => {
        for (const location of locations) {
          builder.string(location)
        }
      })
    }
  }

  const privateLocationIds = (() => {
    try {
      return context.lookupCheckGroupPrivateLocations(resource.id)
    } catch {
      return
    }
  })()

  if (privateLocationIds !== undefined) {
    builder.array('privateLocations', builder => {
      for (const privateLocationId of privateLocationIds) {
        try {
          const privateLocationVariable = context.lookupPrivateLocation(privateLocationId)
          context.importVariable(privateLocationVariable, genfile)
          builder.value(privateLocationVariable.id)
        } catch {
          builder.value(valueForPrivateLocationFromId(genfile, privateLocationId))
        }
      }
    })
  }

  if (resource.tags) {
    const tags = resource.tags
    if (tags.length > 0) {
      builder.array('tags', builder => {
        for (const tag of tags) {
          builder.string(tag)
        }
      })
    }
  }

  if (resource.frequency !== undefined) {
    builder.value('frequency', valueForFrequency(genfile, resource.frequency))
  }

  if (resource.environmentVariables) {
    const variables = resource.environmentVariables
    if (variables.length > 0) {
      builder.array('environmentVariables', builder => {
        for (const variable of variables) {
          builder.value(valueForKeyValuePair(program, genfile, context, variable))
        }
      })
    }
  }

  const alertChannelIds = (() => {
    try {
      return context.lookupCheckGroupAlertChannels(resource.id)
    } catch {
      return
    }
  })()

  if (alertChannelIds !== undefined) {
    builder.array('alertChannels', builder => {
      for (const alertChannelId of alertChannelIds) {
        try {
          const alertChannelVariable = context.lookupAlertChannel(alertChannelId)
          context.importVariable(alertChannelVariable, genfile)
          builder.value(alertChannelVariable.id)
        } catch {
          builder.value(valueForAlertChannelFromId(genfile, alertChannelId))
        }
      }
    })
  }

  if (resource.alertSettings) {
    builder.value('alertEscalationPolicy', valueForAlertEscalation(genfile, resource.alertSettings))
  }

  if (resource.browserChecks) {
    const config = resource.browserChecks
    builder.object('browserChecks', builder => {
      if (Array.isArray(config.testMatch)) {
        builder.array('testMatch', builder => {
          for (const match of config.testMatch) {
            builder.string(match)
          }
        })
      } else {
        builder.string('testMatch', config.testMatch)
      }

      // Only frequency is handled by the construct.
      if (config.frequency !== undefined) {
        builder.value('frequency', valueForFrequency(genfile, config.frequency))
      }
    })
  }

  if (resource.multiStepChecks) {
    const config = resource.multiStepChecks
    builder.object('multiStepChecks', builder => {
      if (Array.isArray(config.testMatch)) {
        builder.array('testMatch', builder => {
          for (const match of config.testMatch) {
            builder.string(match)
          }
        })
      } else {
        builder.string('testMatch', config.testMatch)
      }

      // Only frequency is handled by the construct.
      if (config.frequency !== undefined) {
        builder.value('frequency', valueForFrequency(genfile, config.frequency))
      }
    })
  }

  if (resource.localSetupScript) {
    builder.string('localSetupScript', resource.localSetupScript)
  }

  if (resource.localTearDownScript) {
    builder.string('localTearDownScript', resource.localTearDownScript)
  }

  if (resource.apiCheckDefaults) {
    const config = resource.apiCheckDefaults
    const value = object(builder => {
      if (config.url) {
        builder.string('url', config.url)
      }

      if (config.headers) {
        const headers = config.headers
        if (headers.length > 0) {
          builder.array('headers', builder => {
            for (const header of headers) {
              builder.value(valueForKeyValuePair(program, genfile, context, header))
            }
          })
        }
      }

      if (config.queryParameters) {
        const params = config.queryParameters
        if (params.length > 0) {
          builder.array('queryParameters', builder => {
            for (const param of params) {
              builder.value(valueForKeyValuePair(program, genfile, context, param))
            }
          })
        }
      }

      if (config.basicAuth) {
        const basicAuth = config.basicAuth
        if (basicAuth.username !== '' && basicAuth.password !== '') {
          builder.object('basicAuth', builder => {
            builder.string('username', basicAuth.username)
            builder.string('password', basicAuth.password)
          })
        }
      }

      if (config.assertions) {
        const assertions = config.assertions
        if (assertions.length > 0) {
          builder.array('assertions', builder => {
            for (const assertion of assertions) {
              builder.value(valueForAssertion(genfile, assertion))
            }
          })
        }
      }
    })

    if (!value.isEmpty()) {
      builder.value('apiCheckDefaults', value)
    }
  }

  builder.value('retryStrategy', valueForRetryStrategy(genfile, resource.retryStrategy))

  if (resource.runParallel !== undefined) {
    builder.boolean('runParallel', resource.runParallel)
  }
}

const construct = 'CheckGroup'

export function valueForCheckGroupFromId (genfile: GeneratedFile, physicalId: number): Value {
  genfile.namedImport(construct, 'checkly/constructs')

  return expr(ident(construct), builder => {
    builder.member(ident('fromId'))
    builder.call(builder => {
      builder.number(physicalId)
    })
  })
}

export class CheckGroupCodegen extends Codegen<CheckGroupResource> {
  describe (resource: CheckGroupResource): string {
    return `Check Group: ${resource.name}`
  }

  prepare (logicalId: string, resource: CheckGroupResource, context: Context): void {
    const filename = context.filePath('resources/check-group', resource.name, {
      isolate: true,
      unique: true,
    })

    context.registerCheckGroup(
      resource.id,
      this.program.generatedConstructFile(filename.fullPath),
    )
  }

  gencode (logicalId: string, resource: CheckGroupResource, context: Context): void {
    const { id, file } = context.lookupCheckGroup(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            buildCheckGroupProps(this.program, file, builder, resource, context)
          })
        })
      }))

      builder.export()
    }))
  }
}
