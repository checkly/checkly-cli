import { Program, ObjectValueBuilder } from '../sourcegen'
import { AlertEscalationResource, valueForAlertEscalation } from './alert-escalation-policy.codegen'
import { EnvironmentVariable } from './environment-variable'
import { FrequencyResource, valueForFrequency } from './frequency.codegen'
import { valueForKeyValuePair } from './key-value-pair.codegen'
import { valueForRef } from './ref.codegen'
import { RetryStrategyResource, valueForRetryStrategy } from './retry-strategy.codegen'

export interface CheckResource {
  name: string
  activated?: boolean
  muted?: boolean
  doubleCheck?: boolean
  shouldFail?: boolean
  runtimeId?: string
  locations?: string[]
  // TODO: privateLocations
  tags?: string[]
  frequency?: FrequencyResource
  environmentVariables?: EnvironmentVariable[]
  groupId?: number
  alertSettings?: AlertEscalationResource
  testOnly?: boolean
  retryStrategy?: RetryStrategyResource
  runParallel?: boolean
}

export function buildCheckProps (
  program: Program,
  builder: ObjectValueBuilder,
  resource: CheckResource,
): void {
  builder.string('name', resource.name)

  if (resource.activated !== undefined) {
    builder.boolean('activated', resource.activated)
  }

  if (resource.muted !== undefined) {
    builder.boolean('muted', resource.muted)
  }

  if (resource.shouldFail !== undefined) {
    builder.boolean('shouldFail', resource.shouldFail)
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

  // if (resource.groupId) {
  //   builder.value('groupId', valueForRef(program, resource.groupId))
  // }

  // if (resource.group) {
  //   // TODO: group - live variables
  // }

  // if (resource.alertChannels) {
  //   // TODO: alertChannels - live variables
  // }

  if (resource.alertSettings) {
    builder.value('alertEscalationPolicy', valueForAlertEscalation(program, resource.alertSettings))
  }

  if (resource.testOnly !== undefined) {
    builder.boolean('testOnly', resource.testOnly)
  }

  builder.value('retryStrategy', valueForRetryStrategy(program, resource.retryStrategy))

  if (resource.runParallel !== undefined) {
    builder.boolean('runParallel', resource.runParallel)
  }
}
