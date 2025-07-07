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
   * @deprecated Use {@link retryStrategy} instead.
   */
  doubleCheck?: boolean
  /**
   * Allows to invert the behaviour of when a check is considered to fail. Allows for validating error status like 404.
   * This only applies to API Checks.
   */
  shouldFail?: boolean
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
  /**
   * The id of the check group this check is part of. Set this by calling `someGroup.ref()`
   * @deprecated Use {@link group} instead.
   */
  groupId?: Ref
  /**
   * The CheckGroup that this check is part of.
   */
  group?: CheckGroupV1 | CheckGroupV2 | CheckGroupRef
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
   */
  runtimeId?: string
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
