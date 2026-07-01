import { Codegen, Context } from './internal/codegen/index.js'
import { Program, ObjectValueBuilder, GeneratedFile } from '../sourcegen/index.js'
import { AgenticCheckCodegen, AgenticCheckResource } from './agentic-check-codegen.js'
import { AlertEscalationResource, valueForAlertEscalation } from './alert-escalation-policy-codegen.js'
import { ApiCheckCodegen, ApiCheckResource } from './api-check-codegen.js'
import { BrowserCheckCodegen, BrowserCheckResource } from './browser-check-codegen.js'
import { CheckGroupCodegen, valueForCheckGroupFromId } from './check-group-codegen.js'
import { EnvironmentVariable } from './environment-variable.js'
import { FrequencyResource, valueForFrequency } from './frequency-codegen.js'
import { HeartbeatMonitorCodegen, HeartbeatMonitorResource } from './heartbeat-monitor-codegen.js'
import { valueForKeyValuePair } from './key-value-pair-codegen.js'
import { MultiStepCheckCodegen, MultiStepCheckResource } from './multi-step-check-codegen.js'
import { RetryStrategyResource, valueForRetryStrategy } from './retry-strategy-codegen.js'
import { TcpMonitorCodegen, TcpMonitorResource } from './tcp-monitor-codegen.js'
import { UrlMonitorCodegen, UrlMonitorResource } from './url-monitor-codegen.js'
import { valueForPrivateLocationFromId } from './private-location-codegen.js'
import { valueForAlertChannelFromId } from './alert-channel-codegen.js'
import { DnsMonitorCodegen, DnsMonitorResource } from './dns-monitor-codegen.js'
import { IcmpMonitorCodegen, IcmpMonitorResource } from './icmp-monitor-codegen.js'
import { GrpcMonitorCodegen, GrpcMonitorResource } from './grpc-monitor-codegen.js'
import { SslMonitorCodegen, SslMonitorResource } from './ssl-monitor-codegen.js'
import { TracerouteMonitorCodegen, TracerouteMonitorResource } from './traceroute-monitor-codegen.js'

export interface CheckResource {
  id: string
  checkType: string
  name: string
  description?: string | null
  activated?: boolean
  muted?: boolean
  // Handled by the backend which creates the appropriate retryStrategy.
  // doubleCheck?: boolean
  shouldFail?: boolean
  locations?: string[]
  tags?: string[]
  frequency?: number | FrequencyResource
  frequencyOffset?: number
  groupId?: number
  alertSettings?: AlertEscalationResource
  testOnly?: boolean
  retryStrategy?: RetryStrategyResource
  runParallel?: boolean
}

/**
 * Options controlling which common check fields `buildCheckProps` emits.
 *
 * The defaults match the historical behavior — every field is emitted if
 * the resource provides it. Individual check types can opt out of specific
 * fields when their construct's props type does not accept them. For
 * example, `AgenticCheck` omits `retryStrategy` from its props, so its
 * codegen passes `skipRetryStrategy: true` to avoid emitting code that
 * would not type-check against the construct.
 */
export interface BuildCheckPropsOptions {
  /**
   * Skip emitting the `retryStrategy` property. Unlike most fields in
   * `buildCheckProps`, `retryStrategy` is emitted unconditionally (null is
   * rendered as `RetryStrategyBuilder.noRetries()`), so opting out requires
   * an explicit flag.
   */
  skipRetryStrategy?: boolean
}

export function buildCheckProps (
  program: Program,
  genfile: GeneratedFile,
  builder: ObjectValueBuilder,
  resource: CheckResource,
  context: Context,
  options: BuildCheckPropsOptions = {},
): void {
  builder.string('name', resource.name, { order: -1000 })

  if (resource.description != null) {
    builder.string('description', resource.description)
  }

  if (resource.activated !== undefined) {
    builder.boolean('activated', resource.activated)
  }

  if (resource.muted !== undefined && resource.muted !== false) {
    builder.boolean('muted', resource.muted)
  }

  if (resource.shouldFail !== undefined && resource.shouldFail !== false) {
    builder.boolean('shouldFail', resource.shouldFail)
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
    if (typeof resource.frequency === 'number') {
      builder.value('frequency', valueForFrequency(genfile, {
        frequency: resource.frequency,
        frequencyOffset: resource.frequencyOffset,
      }))
    } else {
      builder.value('frequency', valueForFrequency(genfile, resource.frequency))
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

  if (resource.testOnly !== undefined && resource.testOnly !== false) {
    builder.boolean('testOnly', resource.testOnly)
  }

  if (!options.skipRetryStrategy) {
    builder.value('retryStrategy', valueForRetryStrategy(genfile, resource.retryStrategy))
  }

  if (resource.runParallel !== undefined && resource.runParallel !== false) {
    builder.boolean('runParallel', resource.runParallel)
  }
}

export interface RuntimeCheckResource extends CheckResource {
  runtimeId?: string
  environmentVariables?: EnvironmentVariable[]
}

export function buildRuntimeCheckProps (
  program: Program,
  genfile: GeneratedFile,
  builder: ObjectValueBuilder,
  resource: RuntimeCheckResource,
  context: Context,
): void {
  buildCheckProps(program, genfile, builder, resource, context)

  if (resource.runtimeId) {
    builder.string('runtimeId', resource.runtimeId)
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
}

export class CheckCodegen extends Codegen<CheckResource> {
  agenticCheckCodegen: AgenticCheckCodegen
  apiCheckCodegen: ApiCheckCodegen
  browserCheckCodegen: BrowserCheckCodegen
  checkGroupCodegen: CheckGroupCodegen
  heartbeatMonitorCodegen: HeartbeatMonitorCodegen
  multiStepCheckCodegen: MultiStepCheckCodegen
  tcpMonitorCodegen: TcpMonitorCodegen
  urlMonitorCodegen: UrlMonitorCodegen
  dnsMonitorCodegen: DnsMonitorCodegen
  icmpMonitorCodegen: IcmpMonitorCodegen
  grpcMonitorCodegen: GrpcMonitorCodegen
  sslMonitorCodegen: SslMonitorCodegen
  tracerouteMonitorCodegen: TracerouteMonitorCodegen

  constructor (program: Program) {
    super(program)
    this.agenticCheckCodegen = new AgenticCheckCodegen(program)
    this.apiCheckCodegen = new ApiCheckCodegen(program)
    this.browserCheckCodegen = new BrowserCheckCodegen(program)
    this.checkGroupCodegen = new CheckGroupCodegen(program)
    this.heartbeatMonitorCodegen = new HeartbeatMonitorCodegen(program)
    this.multiStepCheckCodegen = new MultiStepCheckCodegen(program)
    this.tcpMonitorCodegen = new TcpMonitorCodegen(program)
    this.urlMonitorCodegen = new UrlMonitorCodegen(program)
    this.dnsMonitorCodegen = new DnsMonitorCodegen(program)
    this.icmpMonitorCodegen = new IcmpMonitorCodegen(program)
    this.grpcMonitorCodegen = new GrpcMonitorCodegen(program)
    this.sslMonitorCodegen = new SslMonitorCodegen(program)
    this.tracerouteMonitorCodegen = new TracerouteMonitorCodegen(program)
  }

  describe (resource: CheckResource): string {
    const { checkType } = resource

    switch (checkType) {
      case 'AGENTIC':
        return this.agenticCheckCodegen.describe(resource as AgenticCheckResource)
      case 'BROWSER':
        return this.browserCheckCodegen.describe(resource as BrowserCheckResource)
      case 'API':
        return this.apiCheckCodegen.describe(resource as ApiCheckResource)
      case 'TCP':
        return this.tcpMonitorCodegen.describe(resource as TcpMonitorResource)
      case 'MULTI_STEP':
        return this.multiStepCheckCodegen.describe(resource as MultiStepCheckResource)
      case 'HEARTBEAT':
        return this.heartbeatMonitorCodegen.describe(resource as HeartbeatMonitorResource)
      case 'URL':
        return this.urlMonitorCodegen.describe(resource as UrlMonitorResource)
      case 'DNS':
        return this.dnsMonitorCodegen.describe(resource as DnsMonitorResource)
      case 'ICMP':
        return this.icmpMonitorCodegen.describe(resource as IcmpMonitorResource)
      case 'GRPC':
        return this.grpcMonitorCodegen.describe(resource as GrpcMonitorResource)
      case 'SSL':
        return this.sslMonitorCodegen.describe(resource as SslMonitorResource)
      case 'TRACEROUTE':
        return this.tracerouteMonitorCodegen.describe(resource as TracerouteMonitorResource)
      default:
        throw new Error(`Unable to describe unsupported check type '${checkType}'.`)
    }
  }

  gencode (logicalId: string, resource: CheckResource, context: Context): void {
    const { checkType } = resource

    switch (checkType) {
      case 'AGENTIC':
        this.agenticCheckCodegen.gencode(logicalId, resource as AgenticCheckResource, context)
        return
      case 'BROWSER':
        this.browserCheckCodegen.gencode(logicalId, resource as BrowserCheckResource, context)
        return
      case 'API':
        this.apiCheckCodegen.gencode(logicalId, resource as ApiCheckResource, context)
        return
      case 'TCP':
        this.tcpMonitorCodegen.gencode(logicalId, resource as TcpMonitorResource, context)
        return
      case 'MULTI_STEP':
        this.multiStepCheckCodegen.gencode(logicalId, resource as MultiStepCheckResource, context)
        return
      case 'HEARTBEAT':
        this.heartbeatMonitorCodegen.gencode(logicalId, resource as HeartbeatMonitorResource, context)
        return
      case 'URL':
        this.urlMonitorCodegen.gencode(logicalId, resource as UrlMonitorResource, context)
        return
      case 'DNS':
        this.dnsMonitorCodegen.gencode(logicalId, resource as DnsMonitorResource, context)
        return
      case 'ICMP':
        this.icmpMonitorCodegen.gencode(logicalId, resource as IcmpMonitorResource, context)
        return
      case 'GRPC':
        this.grpcMonitorCodegen.gencode(logicalId, resource as GrpcMonitorResource, context)
        return
      case 'SSL':
        this.sslMonitorCodegen.gencode(logicalId, resource as SslMonitorResource, context)
        return
      case 'TRACEROUTE':
        this.tracerouteMonitorCodegen.gencode(logicalId, resource as TracerouteMonitorResource, context)
        return
      default:
        throw new Error(`Unable to generate code for unsupported check type '${checkType}'.`)
    }
  }
}
