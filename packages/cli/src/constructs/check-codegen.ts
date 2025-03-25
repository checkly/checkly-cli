import { Codegen, Context } from './internal/codegen'
import { Program, ObjectValueBuilder } from '../sourcegen'
import { AlertEscalationResource, valueForAlertEscalation } from './alert-escalation-policy-codegen'
import { ApiCheckCodegen, ApiCheckResource } from './api-check-codegen'
import { BrowserCheckCodegen, BrowserCheckResource } from './browser-check-codegen'
import { CheckGroupCodegen } from './check-group-codegen'
import { EnvironmentVariable } from './environment-variable'
import { FrequencyResource, valueForFrequency } from './frequency-codegen'
import { HeartbeatCheckCodegen, HeartbeatCheckResource } from './heartbeat-check-codegen'
import { valueForKeyValuePair } from './key-value-pair-codegen'
import { MultiStepCheckCodegen, MultiStepCheckResource } from './multi-step-check-codegen'
import { RetryStrategyResource, valueForRetryStrategy } from './retry-strategy-codegen'
import { TcpCheckCodegen, TcpCheckResource } from './tcp-check-codegen'
import { valueForPrivateLocationFromId } from './private-location-codegen'
import { valueForAlertChannelFromId } from './alert-channel-codegen'

export interface CheckResource {
  id: string
  checkType: string
  name: string
  activated?: boolean
  muted?: boolean
  doubleCheck?: boolean
  shouldFail?: boolean
  runtimeId?: string
  locations?: string[]
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
  context: Context,
): void {
  builder.string('name', resource.name, { order: -1000 })

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

  const privateLocationIds = (() => {
    try {
      return context.lookupCheckPrivateLocations(resource.id)
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

  if (resource.groupId) {
    try {
      const groupVariable = context.lookupCheckGroup(resource.groupId)
      builder.value('group', groupVariable)
    } catch (err) {
      throw new Error('Check belongs to a group that is not being imported.')
    }
  }

  const alertChannelIds = (() => {
    try {
      return context.lookupCheckAlertChannels(resource.id)
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

  if (resource.testOnly !== undefined) {
    builder.boolean('testOnly', resource.testOnly)
  }

  builder.value('retryStrategy', valueForRetryStrategy(program, resource.retryStrategy))

  if (resource.runParallel !== undefined) {
    builder.boolean('runParallel', resource.runParallel)
  }
}

export class CheckCodegen extends Codegen<CheckResource> {
  apiCheckCodegen: ApiCheckCodegen
  browserCheckCodegen: BrowserCheckCodegen
  checkGroupCodegen: CheckGroupCodegen
  heartbeatCheckCodegen: HeartbeatCheckCodegen
  multiStepCheckCodegen: MultiStepCheckCodegen
  tcpCheckCodegen: TcpCheckCodegen

  constructor (program: Program) {
    super(program)
    this.apiCheckCodegen = new ApiCheckCodegen(program)
    this.browserCheckCodegen = new BrowserCheckCodegen(program)
    this.checkGroupCodegen = new CheckGroupCodegen(program)
    this.heartbeatCheckCodegen = new HeartbeatCheckCodegen(program)
    this.multiStepCheckCodegen = new MultiStepCheckCodegen(program)
    this.tcpCheckCodegen = new TcpCheckCodegen(program)
  }

  gencode (logicalId: string, resource: CheckResource, context: Context): void {
    const { checkType } = resource

    switch (checkType) {
      case 'BROWSER':
        return this.browserCheckCodegen.gencode(logicalId, resource as BrowserCheckResource, context)
      case 'API':
        return this.apiCheckCodegen.gencode(logicalId, resource as ApiCheckResource, context)
      case 'TCP':
        return this.tcpCheckCodegen.gencode(logicalId, resource as TcpCheckResource, context)
      case 'MULTI_STEP':
        return this.multiStepCheckCodegen.gencode(logicalId, resource as MultiStepCheckResource, context)
      case 'HEARTBEAT':
        return this.heartbeatCheckCodegen.gencode(logicalId, resource as HeartbeatCheckResource, context)
      default:
        throw new Error(`Unable to generate code for unsupported check type '${checkType}'.`)
    }
  }
}
