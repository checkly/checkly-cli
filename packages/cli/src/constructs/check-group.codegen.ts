import { Codegen } from '../codegen'
import { expr, ident, ObjectValueBuilder, Program } from '../sourcegen'
import { AlertEscalationResource, valueForAlertEscalation } from './alert-escalation-policy.codegen'
import { ApiCheckDefaultConfig } from './api-check'
import { valueForAssertion } from './api-check.codegen'
import { EnvironmentVariable } from './environment-variable'
import { FrequencyResource, valueForFrequency } from './frequency.codegen'
import { valueForKeyValuePair } from './key-value-pair.codegen'
import { PrivateLocation } from './private-location'
import { RetryStrategyResource, valueForRetryStrategy } from './retry-strategy.codegen'

export interface BrowserCheckConfigResource {
  testMatch: string | string[]
  frequency?: FrequencyResource
}

export interface MultiStepCheckConfigResource {
  testMatch: string | string[]
  frequency?: FrequencyResource
}

export interface CheckGroupResource {
  name: string
  activated?: boolean
  muted?: boolean
  doubleCheck?: boolean
  runtimeId?: string
  locations?: string[]
  // TODO: privateLocations
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

  // if (resource.privateLocations) {
  //   // TODO: privateLocations - live variables
  // }

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

  // if (resource.alertChannels) {
  //   // TODO: alertChannels - live variables
  // }

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
  gencode (logicalId: string, resource: CheckGroupResource): void {
    this.program.import(construct, 'checkly/constructs')

    this.program.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          buildCheckGroupProps(this.program, builder, resource)
        })
      })
    }))
  }
}
