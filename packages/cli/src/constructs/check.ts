import { AlertChannel } from './alert-channel'
import { EnvironmentVariable } from './environment-variable'
import { AlertChannelSubscription } from './alert-channel-subscription'
import { Construct, Session, Ref } from '../internals'
import { CheckConfigDefaults } from '../services/checkly-config-loader'

/**
 *  Supported regions
 */
export type Region = 'us-east-1' | 'us-east-2' | 'us-west-1' | 'us-west-2'
  | 'ca-central-1' | 'sa-east-1'
  | 'eu-west-1' | 'eu-central-1' | 'eu-west-2' | 'eu-west-3' | 'eu-north-1' | 'eu-south-1'
  | 'me-south-1'
  | 'ap-southeast-1' | 'ap-northeast-1' | 'ap-east-1'
  | 'ap-southeast-2' | 'ap-southeast-3' | 'ap-northeast-2' | 'ap-northeast-3'
  | 'ap-south-1' | 'af-south-1'

export interface CheckProps {
  /**
   *  The name of the check.
   */
  name: string
  /**
   *  Determines if the check is running or not.
   */
  activated?: boolean
  /**
   * Determines if any notifications will be send out when a check fails and/or recovers.
   */
  muted?: boolean
  /**
   * Setting this to "true" will trigger a retry when a check fails from the failing region and another,
   * randomly selected region before marking the check as failed.
   */
  doubleCheck?: boolean
  /**
   * Allows to invert the behaviour of when a check is considered to fail. Allows for validating error status like 404.
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
  locations?: Array<Region>
  /**
   * An array of one or more private locations where to run the check.
   */
  privateLocations?: Array<string>
  /**
   * Tags for organizing and filtering checks.
   */
  tags?: Array<string>
  /**
   * How often the check should run in minutes.
   */
  frequency?: number
  environmentVariables?: Array<EnvironmentVariable>
  /**
   * The id of the check group this check is part of.
   */
  groupId?: Ref
  /**
   * List of alert channel subscriptions.
   */
  alertChannels?: Array<AlertChannel>
}

// This is an abstract class. It shouldn't be used directly.
export abstract class Check extends Construct {
  name: string
  activated?: boolean
  muted?: boolean
  doubleCheck?: boolean
  shouldFail?: boolean
  runtimeId?: string
  locations?: Array<Region>
  privateLocations?: Array<string>
  tags?: Array<string>
  frequency?: number
  environmentVariables?: Array<EnvironmentVariable>
  groupId?: Ref
  alertChannels?: Array<AlertChannel>
  __checkFilePath?: string // internal variable to filter by check file name from the CLI

  static readonly __checklyType = 'checks'

  constructor (logicalId: string, props: CheckProps) {
    super(Check.__checklyType, logicalId)
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
    this.frequency = props.frequency
    this.runtimeId = props.runtimeId
    this.environmentVariables = props.environmentVariables ?? []
    // Alert channel subscriptions will be synthesized separately in the Project construct.
    // This is due to the way things are organized on the BE.
    this.alertChannels = props.alertChannels ?? []
    this.groupId = props.groupId
    // alertSettings, useGlobalAlertSettings, groupId, groupOrder

    this.__checkFilePath = Session.checkFilePath
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
    if (!this.alertChannels) {
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

  getSourceFile () {
    return this.__checkFilePath
  }

  synthesize () {
    return {
      name: this.name,
      activated: this.activated,
      muted: this.muted,
      doubleCheck: this.doubleCheck,
      shouldFail: this.shouldFail,
      runtimeId: this.runtimeId,
      locations: this.locations,
      privateLocations: this.privateLocations,
      tags: this.tags,
      frequency: this.frequency,
      groupId: this.groupId,
      environmentVariables: this.environmentVariables,
    }
  }
}
