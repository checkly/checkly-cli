import { Codegen, Context } from './internal/codegen'
import { Program, ObjectValueBuilder, GeneratedFile } from '../sourcegen'
import { AlertEscalationResource, valueForAlertEscalation } from './alert-escalation-policy-codegen'
import { ApiCheckCodegen, ApiCheckResource } from './api-check-codegen'
import { BrowserCheckCodegen, BrowserCheckResource } from './browser-check-codegen'
import { CheckGroupCodegen, valueForCheckGroupFromId } from './check-group-codegen'
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
  // Handled by the backend which creates the appropriate retryStrategy.
  // doubleCheck?: boolean
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
  genfile: GeneratedFile,
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
      return context.lookupCheckPrivateLocations(resource.id)
    } catch {
      return
    }
  })()

  if (privateLocationIds !== undefined) {
    builder.array('privateLocations', builder => {
      for (const privateLocationId of privateLocationIds) {
        try {
          const privateLocationVariable = context.lookupPrivateLocation(privateLocationId)
          const id = context.importVariable(privateLocationVariable, genfile)
          builder.value(id)
        } catch {
          try {
            const privateLocationVariable = context.lookupFriendPrivateLocation(privateLocationId)
            const id = context.importFriendVariable(privateLocationVariable, genfile)
            builder.value(id)
          } catch {
            builder.value(valueForPrivateLocationFromId(genfile, privateLocationId))
          }
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

  if (resource.groupId) {
    try {
      const groupVariable = context.lookupCheckGroup(resource.groupId)
      const id = context.importVariable(groupVariable, genfile)
      builder.value('group', id)
    } catch {
      try {
        const groupVariable = context.lookupFriendCheckGroup(resource.groupId)
        const id = context.importFriendVariable(groupVariable, genfile)
        builder.value('group', id)
      } catch {
        builder.value('group', valueForCheckGroupFromId(genfile, resource.groupId))
      }
    }
  }

  const alertChannelIds = (() => {
    try {
      return context.lookupCheckAlertChannels(resource.id)
    } catch {
      return
    }
  })()

  if (alertChannelIds !== undefined) {
    builder.array('alertChannels', builder => {
      for (const alertChannelId of alertChannelIds) {
        try {
          const alertChannelVariable = context.lookupAlertChannel(alertChannelId)
          const id = context.importVariable(alertChannelVariable, genfile)
          builder.value(id)
        } catch {
          try {
            const alertChannelVariable = context.lookupFriendAlertChannel(alertChannelId)
            const id = context.importFriendVariable(alertChannelVariable, genfile)
            builder.value(id)
          } catch {
            builder.value(valueForAlertChannelFromId(genfile, alertChannelId))
          }
        }
      }
    })
  }

  if (resource.alertSettings) {
    builder.value('alertEscalationPolicy', valueForAlertEscalation(genfile, resource.alertSettings))
  }

  if (resource.testOnly !== undefined) {
    builder.boolean('testOnly', resource.testOnly)
  }

  builder.value('retryStrategy', valueForRetryStrategy(genfile, resource.retryStrategy))

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

  describe (resource: CheckResource): string {
    const { checkType } = resource

    switch (checkType) {
      case 'BROWSER':
        return this.browserCheckCodegen.describe(resource as BrowserCheckResource)
      case 'API':
        return this.apiCheckCodegen.describe(resource as ApiCheckResource)
      case 'TCP':
        return this.tcpCheckCodegen.describe(resource as TcpCheckResource)
      case 'MULTI_STEP':
        return this.multiStepCheckCodegen.describe(resource as MultiStepCheckResource)
      case 'HEARTBEAT':
        return this.heartbeatCheckCodegen.describe(resource as HeartbeatCheckResource)
      default:
        throw new Error(`Unable to describe unsupported check type '${checkType}'.`)
    }
  }

  gencode (logicalId: string, resource: CheckResource, context: Context): void {
    const { checkType } = resource

    switch (checkType) {
      case 'BROWSER':
        this.browserCheckCodegen.gencode(logicalId, resource as BrowserCheckResource, context)
        return
      case 'API':
        this.apiCheckCodegen.gencode(logicalId, resource as ApiCheckResource, context)
        return
      case 'TCP':
        this.tcpCheckCodegen.gencode(logicalId, resource as TcpCheckResource, context)
        return
      case 'MULTI_STEP':
        this.multiStepCheckCodegen.gencode(logicalId, resource as MultiStepCheckResource, context)
        return
      case 'HEARTBEAT':
        this.heartbeatCheckCodegen.gencode(logicalId, resource as HeartbeatCheckResource, context)
        return
      default:
        throw new Error(`Unable to generate code for unsupported check type '${checkType}'.`)
    }
  }
}
