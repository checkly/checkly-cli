import { Codegen, Context } from './internal/codegen/index.js'
import { Program, ObjectValueBuilder, GeneratedFile } from '../sourcegen/index.js'
import { AgenticCheckCodegen, AgenticCheckResource } from './agentic-check-codegen.js'
import { AlertEscalationResource, hasEscalationPolicy, valueForAlertEscalation } from './alert-escalation-policy-codegen.js'
import { ApiCheckCodegen, ApiCheckResource } from './api-check-codegen.js'
import { BrowserCheckCodegen, BrowserCheckResource } from './browser-check-codegen.js'
import { CheckGroupCodegen, valueForCheckGroupFromId } from './check-group-codegen.js'
import { EnvironmentVariable } from './environment-variable.js'
import { FrequencyResource, valueForFrequency } from './frequency-codegen.js'
import { HeartbeatMonitorCodegen, HeartbeatMonitorResource } from './heartbeat-monitor-codegen.js'
import { valueForKeyValuePair } from './key-value-pair-codegen.js'
import { MultiStepCheckCodegen, MultiStepCheckResource } from './multi-step-check-codegen.js'
import { PlaywrightCheckCodegen, PlaywrightCheckResource } from './playwright-check-codegen.js'
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
import { Session } from './session.js'
import { CheckConfigDefaults } from '../services/checkly-config-loader.js'
import { ConfigDefaultsGetter, makeConfigDefaultsGetter } from './check-config.js'

/**
 * Intent shape returned by the checks resource API.
 *
 * Construct code generation adapts this wire representation to typed intent
 * constraints so exported resources round-trip through Monitoring as Code.
 */
export interface CheckIntentResource {
  goal: string
  constraints?: Array<{
    type: 'REQUIRED_OUTCOME' | 'MUST_PRESERVE'
    statement: string
  }>
  /** Compatibility with import plans created before construct-shaped intent was deployed. */
  requiredOutcomes?: string[]
  /** Compatibility with import plans created before construct-shaped intent was deployed. */
  mustPreserve?: string[]
}

export interface CheckResource {
  id: string
  checkType: string
  name: string
  description?: string | null
  intent?: CheckIntentResource | null
  aiAutoRepairEnabled?: boolean | null
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
  alertSettings?: AlertEscalationResource | null
  useGlobalAlertSettings?: boolean | null
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

  /**
   * Skip emitting the `intent` property for constructs that do not support it.
   */
  skipIntent?: boolean

  /**
   * Emit `aiAutoRepairEnabled` for constructs that support automatic check
   * repair. Browser and MultiStep checks are the only current consumers.
   */
  includeAutomaticCheckRepair?: boolean

  /**
   * The locations a construct of this type gives itself when neither the
   * props nor the project config name any (an agentic check falls back to a
   * single region). A row holding exactly these is generated without them.
   */
  fallbackLocations?: readonly string[]

  /**
   * Shared props the construct's own props type omits, which are never
   * generated whatever the row or a project default holds. `retryStrategy`
   * here means the same as `skipRetryStrategy`.
   */
  omit?: readonly OmittableCheckProp[]
}

export type OmittableCheckProp = 'shouldFail' | 'privateLocations' | 'runParallel' | 'retryStrategy'

/**
 * The project-level defaults a construct of the given check type falls back
 * to for a prop it is not given, through the same getter and in the same
 * order the constructs use (`Check`, `BrowserCheck` and `MultiStepCheck`
 * each build theirs in `configDefaultsGetter`): the type's own
 * `checkly.config` section first, then the shared `checks` section. A group's
 * check defaults, which sit in the constructs' chains too, carry only
 * `frequency`, which this lookup never asks for. Under `checkly import` the
 * config is loaded before code is generated; a run from a debug plan file
 * has no config and resolves to the backend defaults alone.
 */
export function projectDefaultsFor (checkType: string): ConfigDefaultsGetter<CheckConfigDefaults> {
  switch (checkType) {
    case 'BROWSER':
      return makeConfigDefaultsGetter(Session.browserCheckDefaults, Session.checkDefaults)
    case 'MULTI_STEP':
      return makeConfigDefaultsGetter(Session.multiStepCheckDefaults, Session.checkDefaults)
    default:
      return makeConfigDefaultsGetter(Session.checkDefaults)
  }
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index])

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

  if (!options.skipIntent && resource.intent != null) {
    const intent = resource.intent
    builder.object('intent', builder => {
      builder.string('goal', intent.goal)

      const constraints = intent.constraints ?? [
        ...(intent.requiredOutcomes ?? []).map(statement => ({ type: 'REQUIRED_OUTCOME' as const, statement })),
        ...(intent.mustPreserve ?? []).map(statement => ({ type: 'MUST_PRESERVE' as const, statement })),
      ]
      if (constraints.length > 0) {
        builder.array('constraints', builder => {
          for (const constraint of constraints) {
            builder.object(builder => {
              builder.string('type', constraint.type)
              builder.string('statement', constraint.statement)
            })
          }
        })
      }
    })
  }

  if (options.includeAutomaticCheckRepair && resource.aiAutoRepairEnabled !== undefined) {
    if (resource.aiAutoRepairEnabled === null) {
      builder.null('aiAutoRepairEnabled')
    } else {
      builder.boolean('aiAutoRepairEnabled', resource.aiAutoRepairEnabled)
    }
  }

  // For activated, muted, shouldFail, locations and tags, a prop is left out
  // only when the construct would fill in the row's value by itself: from
  // the project config when it names one, else the backend default. A row
  // that differs from that is generated explicitly, even when it holds the
  // backend default, so an import does not hand the check to a project-wide
  // setting it never had. alertChannels, privateLocations and
  // environmentVariables are one-directional: never left out when the row
  // holds any (a value comparison against constructs or key/value/locked/
  // secret objects is not attempted), and spelled out as empty when the
  // project default would otherwise fill them. retryStrategy and frequency
  // are always generated. A project default for alertEscalationPolicy or
  // runtimeId still applies to a check generated without one: the construct
  // has no way to say "the global policy" or "the account runtime".
  const defaults = projectDefaultsFor(resource.checkType)
  const omitted = new Set<OmittableCheckProp>(options.omit ?? [])

  if (resource.activated !== undefined && resource.activated !== (defaults('activated') ?? true)) {
    builder.boolean('activated', resource.activated)
  }

  if (resource.muted !== undefined && resource.muted !== (defaults('muted') ?? false)) {
    builder.boolean('muted', resource.muted)
  }

  if (
    !omitted.has('shouldFail')
    && resource.shouldFail !== undefined
    && resource.shouldFail !== (defaults('shouldFail') ?? false)
  ) {
    builder.boolean('shouldFail', resource.shouldFail)
  }

  if (resource.locations) {
    const locations = resource.locations
    const implied = defaults('locations') ?? options.fallbackLocations ?? []
    if (!sameList(locations, implied)) {
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

  if (omitted.has('privateLocations')) {
    // The construct does not take them.
  } else if (privateLocationIds === undefined) {
    // No assignment on the row; spelled out as none only when the project
    // config would otherwise assign some.
    if ((defaults('privateLocations') ?? []).length > 0) {
      builder.array('privateLocations', () => {})
    }
  } else {
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
    if (!sameList(tags, defaults('tags') ?? [])) {
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

  if (alertChannelIds === undefined) {
    // No subscription on the row; spelled out as none only when the project
    // config would otherwise subscribe the check.
    if ((defaults('alertChannels') ?? []).length > 0) {
      builder.array('alertChannels', () => {})
    }
  } else {
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

  // The construct derives `useGlobalAlertSettings` as "no policy given", so a
  // check on the global policy must generate none whatever its stored
  // settings hold (the column keeps the last policy, or the empty object it
  // defaults to). A check flagged as owning a policy that is empty has
  // nothing to keep either, and comes back on the global policy.
  if (resource.useGlobalAlertSettings !== true && hasEscalationPolicy(resource.alertSettings)) {
    builder.value('alertEscalationPolicy', valueForAlertEscalation(genfile, resource.alertSettings))
  }

  if (resource.testOnly !== undefined && resource.testOnly !== false) {
    builder.boolean('testOnly', resource.testOnly)
  }

  if (!options.skipRetryStrategy && !omitted.has('retryStrategy')) {
    builder.value('retryStrategy', valueForRetryStrategy(genfile, resource.retryStrategy))
  }

  if (!omitted.has('runParallel') && resource.runParallel !== undefined && resource.runParallel !== false) {
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
  options: BuildCheckPropsOptions = {},
): void {
  buildCheckProps(program, genfile, builder, resource, context, options)

  if (resource.runtimeId) {
    builder.string('runtimeId', resource.runtimeId)
  }

  if (resource.environmentVariables) {
    const variables = resource.environmentVariables
    // An empty list is spelled out when the project config would otherwise
    // fill it.
    const implied = projectDefaultsFor(resource.checkType)('environmentVariables') ?? []
    if (variables.length > 0 || implied.length > 0) {
      builder.array('environmentVariables', builder => {
        for (const variable of variables) {
          builder.value(valueForKeyValuePair(program, genfile, context, variable))
        }
      })
    }
  }
}

/**
 * Check types whose codegen exists for the deploy preview only, with the
 * reason `checkly import` gives when it refuses one. A check of such a type
 * is defined by an uploaded code bundle, which an import plan cannot hand
 * back as source, so the import refuses the resource instead of generating
 * a construct without its files (the API leaves such checks out of import
 * plans as well).
 */
export const PREVIEW_ONLY_CHECK_TYPES: ReadonlyMap<string, string> = new Map([
  ['PLAYWRIGHT', 'Playwright check suites cannot be imported: their code bundle cannot be unpacked as source.'],
])

export class CheckCodegen extends Codegen<CheckResource> {
  agenticCheckCodegen: AgenticCheckCodegen
  apiCheckCodegen: ApiCheckCodegen
  browserCheckCodegen: BrowserCheckCodegen
  checkGroupCodegen: CheckGroupCodegen
  heartbeatMonitorCodegen: HeartbeatMonitorCodegen
  multiStepCheckCodegen: MultiStepCheckCodegen
  playwrightCheckCodegen: PlaywrightCheckCodegen
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
    this.playwrightCheckCodegen = new PlaywrightCheckCodegen(program)
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
      case 'PLAYWRIGHT':
        return this.playwrightCheckCodegen.describe(resource as PlaywrightCheckResource)
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
      case 'PLAYWRIGHT':
        this.playwrightCheckCodegen.gencode(logicalId, resource as PlaywrightCheckResource, context)
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
