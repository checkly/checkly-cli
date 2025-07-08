import { Ref } from './ref'
import { Frequency } from './frequency'
import { Construct } from './construct'
import { AlertChannel, AlertChannelRef } from './alert-channel'
import { EnvironmentVariable } from './environment-variable'
import { AlertChannelSubscription } from './alert-channel-subscription'
import { Session } from './project'
import type { Region } from '..'
import type { CheckGroupV1, CheckGroupV2, CheckGroupRef } from './check-group'
import { PrivateLocation, PrivateLocationRef } from './private-location'
import { PrivateLocationCheckAssignment } from './private-location-check-assignment'
import { RetryStrategy } from './retry-strategy'
import { AlertEscalation } from './alert-escalation-policy'
import { IncidentTrigger } from './incident'
import { ConfigDefaultsGetter, makeConfigDefaultsGetter } from './check-config'
import { Diagnostics } from './diagnostics'
import { validateDeprecatedDoubleCheck } from './internal/common-diagnostics'

/**
 * Base configuration properties for all check types.
 * These properties are inherited by ApiCheck, BrowserCheck, and other check types.
 */
export interface CheckProps {
  /**
   * The display name of the check. This will be shown in the Checkly dashboard.
   * 
   * @example "User API Health Check"
   */
  name: string
  
  /**
   * Determines whether the check will run periodically after being deployed.
   * Set to `false` to pause a check without deleting it.
   * 
   * @defaultValue true
   */
  activated?: boolean
  
  /**
   * Determines if any notifications will be sent out when a check fails and/or recovers.
   * Useful for temporarily silencing alerts during maintenance.
   * 
   * @defaultValue false
   */
  muted?: boolean
  
  /**
   * Setting this to "true" will trigger a retry when a check fails from the failing region and another,
   * randomly selected region before marking the check as failed.
   * @deprecated Use {@link retryStrategy} instead.
   */
  doubleCheck?: boolean
  
  /**
   * Allows to invert the behaviour of when a check is considered to fail. 
   * Useful for validating error status codes like 404 or 500.
   * This only applies to API Checks. When set to true, the check passes when 
   * it would normally fail, and fails when it would normally pass.
   * 
   * @defaultValue false
   * @example
   * ```typescript
   * // Check that expects a 404 status - must set shouldFail: true
   * shouldFail: true,
   * request: {
   *   method: 'GET',
   *   url: 'https://api.example.com/nonexistent',
   *   assertions: [AssertionBuilder.statusCode().equals(404)]
   * }
   * ```
   */
  shouldFail?: boolean
  
  /**
   * An array of one or more data center locations where to run this check.
   * 
   * @example ['us-east-1', 'eu-west-1', 'ap-southeast-1']
   * @see {@link https://www.checklyhq.com/docs/monitoring/global-locations/ | Global Locations}
   */
  locations?: Array<keyof Region>
  
  /**
   * An array of one or more private locations where to run the check.
   * PrivateLocation instances or slug name strings are allowed.
   *
   * `string` slug names are **only** allowed for private locations that **not** belong to the project. Use
   * PrivateLocation instances references for private locations created within the project.
   * 
   * @example
   * ```typescript
   * // Using private location instances
   * privateLocations: [myPrivateLocation, anotherPrivateLocation]
   * 
   * // Using existing private location slugs
   * privateLocations: ['my-datacenter-1', 'office-location']
   * ```
   */
  privateLocations?: Array<string|PrivateLocation|PrivateLocationRef>
  
  /**
   * Tags for organizing and filtering checks in the dashboard.
   * 
   * @example ['production', 'api', 'critical']
   */
  tags?: Array<string>
  
  /**
   * How often the check should run. Can be specified in minutes or using Frequency constants.
   * 
   * @example
   * ```typescript
   * frequency: Frequency.EVERY_5M  // Using frequency constant
   * frequency: 10                   // Every 10 minutes
   * ```
   */
  frequency?: number | Frequency
  /**
   * The id of the check group this check is part of. Set this by calling `someGroup.ref()`
   * @deprecated Use {@link group} instead.
   */
  groupId?: Ref
  
  /**
   * The CheckGroup that this check is part of.
   * Groups allow you to organize related checks and apply common settings.
   * 
   * @example
   * ```typescript
   * // Create a new check group
   * const apiGroup = new CheckGroupV2('api-group', {
   *   name: 'API Checks',
   *   activated: true,
   *   locations: ['us-east-1']
   * })
   * 
   * // Reference an existing check group by ID
   * const existingGroup = CheckGroupV2.fromId(123)
   * 
   * // Use in check configuration
   * group: apiGroup  // or existingGroup
   * ```
   */
  group?: CheckGroupV1 | CheckGroupV2 | CheckGroupRef
  
  /**
   * List of alert channels to notify when the check fails or recovers.
   * If you don't set at least one, we won't be able to alert you in case something goes wrong with your check.
   * 
   * @example
   * ```typescript
   * // Create alert channels once at the project level
   * const emailChannel = new EmailAlertChannel('team-email', { 
   *   address: 'team@example.com' 
   * })
   * const slackChannel = new SlackAlertChannel('team-slack', { 
   *   url: 'https://hooks.slack.com/...' 
   * })
   * 
   * // Reference the channels in your check
   * alertChannels: [emailChannel, slackChannel]
   * ```
   * @see {@link https://www.checklyhq.com/docs/alerting-and-retries/alert-channels/ | Alert Channels}
   */
  alertChannels?: Array<AlertChannel|AlertChannelRef>,
  
  /**
   * Determines the alert escalation policy for that particular check.
   * Controls when and how alerts are escalated based on failure patterns.
   * 
   * @example
   * ```typescript
   * alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(3, {
   *   amount: 2,
   *   interval: 10
   * })
   * ```
   */
  alertEscalationPolicy?: AlertEscalation
  
  /**
   * Determines if the check is available only when 'test' runs (not included when 'deploy' is executed).
   * Useful for development and testing scenarios.
   * 
   * @defaultValue false
   */
  testOnly?: boolean
  
  /**
   * Sets a retry policy for the check. Use RetryStrategyBuilder to create a retry policy.
   * 
   * @example
   * ```typescript
   * retryStrategy: RetryStrategyBuilder.fixedStrategy({
   *   maxRetries: 3,
   *   baseBackoffSeconds: 30,
   *   sameRegion: false
   * })
   * ```
   */
  retryStrategy?: RetryStrategy
  
  /**
   * Determines whether the check should run on all selected locations in parallel or round-robin.
   * 
   * @defaultValue false (round-robin)
   * @see {@link https://www.checklyhq.com/docs/monitoring/global-locations/ | Scheduling Strategies}
   */
  runParallel?: boolean
  
  /**
   * Determines whether the check should create and resolve an incident based on its alert configuration.
   * Useful for status page automation.
   * 
   * @see {@link https://www.checklyhq.com/docs/status-pages/incidents/#incident-automation | Incident Automation}
   */
  triggerIncident?: IncidentTrigger
}

export abstract class Check extends Construct {
  name: string
  activated?: boolean
  muted?: boolean
  doubleCheck?: boolean
  shouldFail?: boolean
  locations?: Array<keyof Region>
  privateLocations?: Array<string|PrivateLocation|PrivateLocationRef>
  tags?: Array<string>
  frequency?: number
  frequencyOffset?: number
  groupId?: Ref
  alertChannels?: Array<AlertChannel|AlertChannelRef>
  testOnly?: boolean
  retryStrategy?: RetryStrategy
  alertSettings?: AlertEscalation
  useGlobalAlertSettings?: boolean
  runParallel?: boolean
  triggerIncident?: IncidentTrigger
  __checkFilePath?: string // internal variable to filter by check file name from the CLI

  static readonly __checklyType = 'check'

  protected constructor (logicalId: string, props: CheckProps) {
    super(Check.__checklyType, logicalId)
    const config = this.applyConfigDefaults(props)
    // TODO: Throw an error if required properties are still missing after applying the defaults.
    this.name = config.name
    this.activated = config.activated
    this.muted = config.muted
    this.doubleCheck = config.doubleCheck
    this.shouldFail = config.shouldFail
    this.locations = config.locations
    this.privateLocations = config.privateLocations
    this.tags = config.tags
    if (config.frequency instanceof Frequency) {
      this.frequency = config.frequency.frequency
      this.frequencyOffset = config.frequency.frequencyOffset
    } else {
      this.frequency = config.frequency
    }
    // Alert channel subscriptions will be synthesized separately in the Project construct.
    // This is due to the way things are organized on the BE.
    this.alertChannels = config.alertChannels ?? []
    // Prefer the `group` parameter, but support groupId for backwards compatibility.
    this.groupId = config.group?.ref() ?? config.groupId
    // alertSettings, useGlobalAlertSettings, groupId, groupOrder

    this.testOnly = config.testOnly ?? false
    this.retryStrategy = config.retryStrategy
    this.alertSettings = config.alertEscalationPolicy
    this.useGlobalAlertSettings = !this.alertSettings
    this.runParallel = config.runParallel ?? false
    this.triggerIncident = config.triggerIncident
    this.__checkFilePath = Session.checkFilePath
  }

  protected async validateDoubleCheck (diagnostics: Diagnostics): Promise<void> {
    await validateDeprecatedDoubleCheck(diagnostics, this)
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)
    await this.validateDoubleCheck(diagnostics)
  }

  protected configDefaultsGetter (props: CheckProps): ConfigDefaultsGetter {
    return makeConfigDefaultsGetter(
      props.group?.getCheckDefaults(),
      Session.checkDefaults,
    )
  }

  protected applyConfigDefaults<T extends CheckProps> (props: T): T {
    const config = Object.assign({}, props)

    const defaults = this.configDefaultsGetter(props)

    config.activated ??= defaults('activated')
    config.alertChannels ??= defaults('alertChannels')
    config.alertEscalationPolicy ??= defaults('alertEscalationPolicy')
    config.doubleCheck ??= defaults('doubleCheck')
    config.frequency ??= defaults('frequency')
    config.locations ??= defaults('locations')
    config.muted ??= defaults('muted')
    config.privateLocations ??= defaults('privateLocations')
    config.retryStrategy ??= defaults('retryStrategy')
    config.shouldFail ??= defaults('shouldFail')
    config.tags ??= defaults('tags')

    return config
  }

  /**
   * Creates alert channel subscriptions for this check.
   * Links the check to its configured alert channels to send notifications.
   * Only creates subscriptions if alert channels are configured and check is not test-only.
   */
  addSubscriptions () {
    if (!this.alertChannels || this.testOnly) {
      return
    }
    for (const alertChannel of this.alertChannels) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const subscription = new AlertChannelSubscription(`check-alert-channel-subscription#${this.logicalId}#${alertChannel.logicalId}`, {
        alertChannelId: Ref.from(alertChannel.logicalId),
        checkId: Ref.from(this.logicalId),
        activated: true,
      })
    }
  }

  /**
   * Creates private location assignments for this check.
   * Links the check to its configured private locations so it can run on them.
   * Only processes PrivateLocation instances, not string slugs.
   */
  addPrivateLocationCheckAssignments () {
    if (!this.privateLocations) {
      return
    }
    for (const privateLocation of this.privateLocations) {
      // slugName strings are processed in loadAllPrivateLocations()
      if (typeof privateLocation === 'string') {
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const assignment = new PrivateLocationCheckAssignment(`private-location-check-assignment#${this.logicalId}#${privateLocation.logicalId}`, {
        privateLocationId: Ref.from(privateLocation.logicalId),
        checkId: Ref.from(this.logicalId),
      })
    }
  }

  /**
   * Gets the source file path where this check was defined.
   * Used for filtering and debugging purposes.
   * 
   * @returns The absolute path to the check file, or undefined if not set
   */
  getSourceFile () {
    return this.__checkFilePath
  }

  synthesize () {
    const triggerIncident = (() => {
      if (this.triggerIncident) {
        const { service, ...triggerIncident } = this.triggerIncident
        return {
          ...triggerIncident,
          serviceId: service.ref(),
        }
      }
    })()

    return {
      name: this.name,
      activated: this.activated,
      muted: this.muted,
      shouldFail: this.shouldFail,
      locations: this.locations,

      // private-location instances are assigned with loadAllPrivateLocations()
      privateLocations: undefined,

      tags: this.tags,
      frequency: this.frequency,
      frequencyOffset: this.frequencyOffset,
      // If the check does not belong to a group, we still need to send null
      // to make sure that the group gets unassigned from any group it may
      // already have belonged to.
      groupId: this.groupId ?? null,
      // The backend doesn't actually support the `NO_RETRIES` type, it uses `null` instead.
      retryStrategy: this.retryStrategy?.type === 'NO_RETRIES'
        ? null
        : this.retryStrategy,
      // When `retryStrategy: NO_RETRIES` and `doubleCheck: undefined`, we want to let the user disable all retries.
      // The backend has a Joi default of `doubleCheck: true`, though, so we need special handling for this case.
      doubleCheck: this.doubleCheck === undefined && this.retryStrategy?.type === 'NO_RETRIES'
        ? false
        : this.doubleCheck,
      alertSettings: this.alertSettings,
      useGlobalAlertSettings: this.useGlobalAlertSettings,
      runParallel: this.runParallel,
      triggerIncident,
    }
  }
}

export interface RuntimeCheckProps extends CheckProps {
  /**
   * The runtime version, i.e. fixed set of runtime dependencies, used to execute this check.
   * 
   * @example "2024.09"
   * @see {@link https://www.checklyhq.com/docs/runtimes/ | Runtime Documentation}
   */
  runtimeId?: string
  
  /**
   * Environment variables available to the check script.
   * Maximum of 50 environment variables per check.
   * 
   * @maxItems 50
   * @example
   * ```typescript
   * environmentVariables: [
   *   { key: 'API_TOKEN', value: '{{API_TOKEN}}', secret: true },
   *   { key: 'BASE_URL', value: 'https://api.example.com' }
   * ]
   * ```
   */
  environmentVariables?: EnvironmentVariable[]
}

export abstract class RuntimeCheck extends Check {
  runtimeId?: string
  environmentVariables?: EnvironmentVariable[]

  protected constructor (logicalId: string, props: RuntimeCheckProps) {
    super(logicalId, props)
    const config = this.applyConfigDefaults(props)
    this.runtimeId = config.runtimeId
    this.environmentVariables = config.environmentVariables ?? []
  }

  protected applyConfigDefaults<T extends RuntimeCheckProps> (props: T): T {
    const config = super.applyConfigDefaults(props)
    const defaults = this.configDefaultsGetter(props)

    config.environmentVariables ??= defaults('environmentVariables')
    config.runtimeId ??= defaults('runtimeId')

    return config
  }

  synthesize () {
    return {
      ...super.synthesize(),
      runtimeId: this.runtimeId,
      environmentVariables: this.environmentVariables,
    }
  }
}
