import { Codegen } from '../codegen'
import { Program, ObjectValueBuilder } from '../sourcegen'
import { AlertEscalationResource, valueForAlertEscalation } from './alert-escalation-policy.codegen'
import { ApiCheckCodegen, ApiCheckResource } from './api-check.codegen'
import { BrowserCheckCodegen, BrowserCheckResource } from './browser-check.codegen'
import { CheckGroupCodegen } from './check-group.codegen'
import { EnvironmentVariable } from './environment-variable'
import { FrequencyResource, valueForFrequency } from './frequency.codegen'
import { HeartbeatCheckCodegen, HeartbeatCheckResource } from './heartbeat-check.codegen'
import { valueForKeyValuePair } from './key-value-pair.codegen'
import { MultiStepCheckCodegen, MultiStepCheckResource } from './multi-step-check.codegen'
import { valueForRef } from './ref.codegen'
import { RetryStrategyResource, valueForRetryStrategy } from './retry-strategy.codegen'
import { TcpCheckCodegen, TcpCheckResource } from './tcp-check.codegen'

export interface CheckResource {
  checkType: string
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

  gencode (logicalId: string, resource: CheckResource): void {
    const { checkType } = resource

    switch (checkType) {
      case 'BROWSER':
        return this.browserCheckCodegen.gencode(logicalId, resource as BrowserCheckResource)
      case 'API':
        return this.apiCheckCodegen.gencode(logicalId, resource as ApiCheckResource)
      case 'TCP':
        return this.tcpCheckCodegen.gencode(logicalId, resource as TcpCheckResource)
      case 'MULTI_STEP':
        return this.multiStepCheckCodegen.gencode(logicalId, resource as MultiStepCheckResource)
      case 'HEARTBEAT':
        return this.heartbeatCheckCodegen.gencode(logicalId, resource as HeartbeatCheckResource)
      default:
        throw new Error(`Unable to generate code for unsupported check type '${checkType}'.`)
    }
  }
}
