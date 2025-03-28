import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident, ObjectValueBuilder, Program } from '../sourcegen'
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
    builder.array('locations', builder => {
      for (const location of locations) {
        builder.string(location)
      }
    })
  }

  const privateLocationIds = (() => {
    try {
      return context.lookupCheckGroupPrivateLocations(resource.id)
    } catch (err) {
    }
  })()

  if (privateLocationIds !== undefined) {
    builder.array('privateLocations', builder => {
      for (const privateLocationId of privateLocationIds) {
        try {
          const privateLocationVariable = context.lookupPrivateLocation(privateLocationId)
          builder.value(privateLocationVariable)
        } catch (err) {
          builder.value(valueForPrivateLocationFromId(program, privateLocationId))
        }
      }
    })
  }

  if (resource.tags) {
    const tags = resource.tags
    builder.array('tags', builder => {
      for (const tag of tags) {
        builder.string(tag)
      }
    })
  }

  if (resource.frequency !== undefined) {
    builder.value('frequency', valueForFrequency(program, resource.frequency))
  }

  if (resource.environmentVariables) {
    const variables = resource.environmentVariables
    builder.array('environmentVariables', builder => {
      for (const variable of variables) {
        builder.value(valueForKeyValuePair(variable))
      }
    })
  }

  const alertChannelIds = (() => {
    try {
      return context.lookupCheckGroupAlertChannels(resource.id)
    } catch (err) {
    }
  })()

  if (alertChannelIds !== undefined) {
    builder.array('alertChannels', builder => {
      for (const alertChannelId of alertChannelIds) {
        try {
          const alertChannelVariable = context.lookupAlertChannel(alertChannelId)
          builder.value(alertChannelVariable)
        } catch (err) {
          builder.value(valueForAlertChannelFromId(program, alertChannelId))
        }
      }
    })
  }

  if (resource.alertSettings) {
    builder.value('alertEscalationPolicy', valueForAlertEscalation(program, resource.alertSettings))
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
        builder.value('frequency', valueForFrequency(program, config.frequency))
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
        builder.value('frequency', valueForFrequency(program, config.frequency))
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
    builder.object('apiCheckDefaults', builder => {
      if (config.url) {
        builder.string('url', config.url)
      }

      if (config.headers) {
        const headers = config.headers
        builder.array('headers', builder => {
          for (const header of headers) {
            builder.value(valueForKeyValuePair(header))
          }
        })
      }

      if (config.queryParameters) {
        const params = config.queryParameters
        builder.array('queryParameters', builder => {
          for (const param of params) {
            builder.value(valueForKeyValuePair(param))
          }
        })
      }

      if (config.basicAuth) {
        const basicAuth = config.basicAuth
        builder.object('basicAuth', builder => {
          builder.string('username', basicAuth.username)
          builder.string('password', basicAuth.password)
        })
      }

      if (config.assertions) {
        const assertions = config.assertions
        builder.array('assertions', builder => {
          for (const assertion of assertions) {
            builder.value(valueForAssertion(program, assertion))
          }
        })
      }
    })
  }

  builder.value('retryStrategy', valueForRetryStrategy(program, resource.retryStrategy))

  if (resource.runParallel !== undefined) {
    builder.boolean('runParallel', resource.runParallel)
  }
}

const construct = 'CheckGroup'

export class CheckGroupCodegen extends Codegen<CheckGroupResource> {
  prepare (logicalId: string, resource: CheckGroupResource, context: Context): void {
    context.registerCheckGroup(resource.id)
  }

  gencode (logicalId: string, resource: CheckGroupResource, context: Context): void {
    this.program.import(construct, 'checkly/constructs')

    const id = context.lookupCheckGroup(resource.id)

    this.program.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            buildCheckGroupProps(this.program, builder, resource, context)
          })
        })
      }))

      builder.export()
    }))
  }
}
