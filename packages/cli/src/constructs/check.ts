import { Ref } from './ref'
import { Frequency } from './frequency'
import { Construct } from './construct'
import { AlertChannel, AlertChannelRef } from './alert-channel'
import { EnvironmentVariable } from './environment-variable'
import { AlertChannelSubscription } from './alert-channel-subscription'
import { Session } from './project'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import type { Region } from '..'
import type { CheckGroup, CheckGroupRef } from './check-group'
import { PrivateLocation, PrivateLocationRef } from './private-location'
import { PrivateLocationCheckAssignment } from './private-location-check-assignment'
import { RetryStrategy } from './retry-strategy'
import { AlertEscalation } from './alert-escalation-policy'
import { IncidentTrigger } from './incident'

export interface CheckProps {
  /**
   *  The name of the check.
   */
  name: string
  /**
   *  Determines whether the check will run periodically or not after being deployed.
   */
  activated?: boolean
  /**
   * Determines if any notifications will be sent out when a check fails and/or recovers.
   */
  muted?: boolean
  /**
   * Setting this to "true" will trigger a retry when a check fails from the failing region and another,
   * randomly selected region before marking the check as failed.
   * @deprecated Use {@link CheckProps.retryStrategy} instead.
   */
  doubleCheck?: boolean
  /**
   * Allows to invert the behaviour of when a check is considered to fail. Allows for validating error status like 404.
   * This only applies to API Checks.
   */
  shouldFail?: boolean
  /**
   * The runtime version, i.e. fixed set of runtime dependencies, used to execute this check.
   */
  runtimeId?: string
  /**
   * An array of one or more data center locations where to run this check. The supported regions are:
   * us-east-1, us-east-2, us-west-1, us-west-2, ca-central-1, sa-east-1,
   * eu-west-1, eu-central-1, eu-west-2, eu-west-3, eu-north-1, eu-south-1, me-south-1,
   * ap-southeast-1, ap-northeast-1, ap-east-1, ap-southeast-2, ap-southeast-3, ap-northeast-2, ap-northeast-3,
   * ap-south-1, af-south-1
   */
  locations?: Array<keyof Region>
  /**
   * An array of one or more private locations where to run the check.
   * PrivateLocation instances or slug name strings are allowed.
   *
   * `string` slug names are **only** allowed for private locations that **not** belong to the project. Use
   * PrivateLocation instances references for private locations created within the project.
   */
  privateLocations?: Array<string|PrivateLocation|PrivateLocationRef>
  /**
   * Tags for organizing and filtering checks.
   */
  tags?: Array<string>
  /**
   * How often the check should run in minutes.
   */
  frequency?: number | Frequency
  environmentVariables?: Array<EnvironmentVariable>
  /**
   * The id of the check group this check is part of. Set this by calling `someGroup.ref()`
   * @deprecated Use {@link CheckProps.group} instead.
   */
  groupId?: Ref
  /**
   * The CheckGroup that this check is part of.
   */
  group?: CheckGroup|CheckGroupRef
  /**
   * List of alert channels to notify when the check fails or recovers.
   * If you don't set at least one, we won't be able to alert you in case something goes wrong with your check.
   * @link {https://www.checklyhq.com/docs/alerting-and-retries/alert-channels/#alert-channels Alert channels}
   */
  alertChannels?: Array<AlertChannel|AlertChannelRef>,
  /**
   * Determines the alert escalation policy for that particular check
   */
  alertEscalationPolicy?: AlertEscalation
  /**
   * Determines if the check is available only when 'test' runs (not included when 'deploy' is executed).
   */
  testOnly?: boolean
  /**
   * Sets a retry policy for the check. Use RetryStrategyBuilder to create a retry policy.
   */
  retryStrategy?: RetryStrategy
  /**
   * Determines whether the check should run on all selected locations in parallel or round-robin.
   * See https://www.checklyhq.com/docs/monitoring/global-locations/ to learn more about scheduling strategies.
   */
  runParallel?: boolean
  /**
   * Determines whether the check should create and resolve an incident based on its alert configuration.
   * See https://www.checklyhq.com/docs/status-pages/incidents/#incident-automation to learn more about automated
   * incidents.
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
