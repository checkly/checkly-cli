import { Ref } from './ref'
import { Frequency } from './frequency'
import { Construct } from './construct'
import { AlertChannel, AlertChannelRef } from './alert-channel'
import { EnvironmentVariable } from './environment-variable'
import { AlertChannelSubscription } from './alert-channel-subscription'
import { Session } from './project'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import type { Region } from '..'
import type { CheckGroupV1, CheckGroupV2, CheckGroupRef } from './check-group'
import { PrivateLocation, PrivateLocationRef } from './private-location'
import { PrivateLocationCheckAssignment } from './private-location-check-assignment'
import { RetryStrategy } from './retry-strategy'
import { AlertEscalation } from './alert-escalation-policy'
import { IncidentTrigger } from './incident'

/**
 * Base configuration properties for all check types.
 * These properties are inherited by ApiCheck, BrowserCheck, and other check types.
 * 
 * @example
 * ```typescript
 * const commonCheckProps: Partial<CheckProps> = {
 *   frequency: Frequency.EVERY_5M,
 *   locations: ['us-east-1', 'eu-west-1'],
 *   tags: ['production', 'api'],
 *   alertChannels: [emailAlert, slackAlert],
 *   retryStrategy: RetryStrategyBuilder.fixedStrategy({
 *     maxRetries: 2,
 *     baseBackoffSeconds: 60
 *   })
 * }
 * ```
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
   * 
   * @deprecated Use {@link CheckProps.retryStrategy} instead.
   */
  doubleCheck?: boolean
  
  /**
   * Allows to invert the behaviour of when a check is considered to fail. 
   * Useful for validating error status codes like 404 or 500.
   * This only applies to API Checks.
   * 
   * @defaultValue false
   * @example
   * ```typescript
   * // Check that expects a 404 status
   * shouldFail: true,
   * request: {
   *   url: 'https://api.example.com/nonexistent',
   *   assertions: [AssertionBuilder.statusCode().equals(404)]
   * }
   * ```
   */
  shouldFail?: boolean
  
  /**
   * The runtime version, i.e. fixed set of runtime dependencies, used to execute this check.
   * 
   * @example "2023.09" | "2022.10"
   * @see {@link https://www.checklyhq.com/docs/runtimes/ | Runtime Documentation}
   */
  runtimeId?: string
  
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
   * Environment variables available to the check script.
   * 
   * @example
   * ```typescript
   * environmentVariables: [
   *   { key: 'API_TOKEN', value: '{{API_TOKEN}}', secret: true },
   *   { key: 'BASE_URL', value: 'https://api.example.com' }
   * ]
   * ```
   */
  environmentVariables?: Array<EnvironmentVariable>
  
  /**
   * The id of the check group this check is part of. Set this by calling `someGroup.ref()`
   * @deprecated Use {@link CheckProps.group} instead.
   */
  groupId?: Ref
  
  /**
   * The CheckGroup that this check is part of.
   * Groups allow you to organize related checks and apply common settings.
   * 
   * @example
   * ```typescript
   * const apiGroup = new CheckGroupV2('api-group', {
   *   name: 'API Checks',
   *   activated: true,
   *   locations: ['us-east-1']
   * })
   * 
   * group: apiGroup
   * ```
   */
  group?: CheckGroupV1 | CheckGroupV2 | CheckGroupRef
  
  /**
   * List of alert channels to notify when the check fails or recovers.
   * If you don't set at least one, we won't be able to alert you in case something goes wrong with your check.
   * 
   * @example
   * ```typescript
   * alertChannels: [
   *   new EmailAlertChannel('email-alerts', { address: 'team@example.com' }),
   *   new SlackAlertChannel('slack-alerts', { url: 'https://hooks.slack.com/...' })
   * ]
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

// This is an abstract class. It shouldn't be used directly.
export abstract class Check extends Construct {
  name: string
  activated?: boolean
  muted?: boolean
  doubleCheck?: boolean
  shouldFail?: boolean
  runtimeId?: string
  locations?: Array<keyof Region>
  privateLocations?: Array<string|PrivateLocation|PrivateLocationRef>
  tags?: Array<string>
  frequency?: number
  frequencyOffset?: number
  environmentVariables?: Array<EnvironmentVariable>
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

  constructor (logicalId: string, props: CheckProps) {
    super(Check.__checklyType, logicalId)
    if (props.group) {
      Check.applyDefaultCheckGroupConfig(props, props.group.getCheckDefaults())
    }
    Check.applyDefaultCheckConfig(props)
    // TODO: Throw an error if required properties are still missing after applying the defaults.
    this.name = props.name
    this.activated = props.activated
    this.muted = props.muted
    this.doubleCheck = props.doubleCheck
    this.shouldFail = props.shouldFail
    this.locations = props.locations
    this.privateLocations = props.privateLocations
    this.tags = props.tags
    if (props.frequency instanceof Frequency) {
      this.frequency = props.frequency.frequency
      this.frequencyOffset = props.frequency.frequencyOffset
    } else {
      this.frequency = props.frequency
    }
    this.runtimeId = props.runtimeId
    this.environmentVariables = props.environmentVariables ?? []
    // Alert channel subscriptions will be synthesized separately in the Project construct.
    // This is due to the way things are organized on the BE.
    this.alertChannels = props.alertChannels ?? []
    // Prefer the `group` parameter, but support groupId for backwards compatibility.
    this.groupId = props.group?.ref() ?? props.groupId
    // alertSettings, useGlobalAlertSettings, groupId, groupOrder

    this.testOnly = props.testOnly ?? false
    this.retryStrategy = props.retryStrategy
    this.alertSettings = props.alertEscalationPolicy
    this.useGlobalAlertSettings = !this.alertSettings
    this.runParallel = props.runParallel ?? false
    this.triggerIncident = props.triggerIncident
    this.__checkFilePath = Session.checkFilePath
  }

  private static applyDefaultCheckGroupConfig (props: CheckConfigDefaults, groupProps: CheckConfigDefaults) {
    let configKey: keyof CheckConfigDefaults
    for (configKey in groupProps) {
      const newVal: any = props[configKey] ?? groupProps[configKey]
      props[configKey] = newVal
    }
  }

  private static applyDefaultCheckConfig (props: CheckConfigDefaults) {
    if (!Session.checkDefaults) {
      return
    }
    let configKey: keyof CheckConfigDefaults
    for (configKey in Session.checkDefaults) {
      const newVal: any = props[configKey] ?? Session.checkDefaults[configKey]
      props[configKey] = newVal
    }
  }

  /**
   * Creates alert channel subscriptions for this check.
   * Links the check to its configured alert channels so notifications are sent.
   * Only creates subscriptions if alert channels are configured and check is not test-only.
   */
  addSubscriptions () {
    if (!this.alertChannels || this.testOnly) {
      return
    }
    for (const alertChannel of this.alertChannels) {
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

      // use private location assignment for instances
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
      runtimeId: this.runtimeId,
      locations: this.locations,

      // private-location instances are assigned with loadAllPrivateLocations()
      privateLocations: undefined,

      tags: this.tags,
      frequency: this.frequency,
      frequencyOffset: this.frequencyOffset,
      groupId: this.groupId,
      environmentVariables: this.environmentVariables,
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
