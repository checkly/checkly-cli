import { Ref } from './ref'
import { Construct } from './construct'
import { AlertChannel } from './alert-channel'
import { EnvironmentVariable } from './environment-variable'
import { AlertChannelSubscription } from './alert-channel-subscription'

export interface CheckProps {
  name: string
  activated: boolean
  muted: boolean
  doubleCheck?: boolean
  shouldFail?: boolean
  runtimeId?: string
  locations: Array<string>
  tags?: Array<string>
  frequency?: number
  environmentVariables?: Array<EnvironmentVariable>
  groupId?: Ref
  alertChannels?: Array<AlertChannel>
}

// This is an abstract class. It shouldn't be used directly.
export abstract class Check extends Construct {
  name: string
  activated: boolean
  muted: boolean
  doubleCheck?: boolean
  shouldFail?: boolean
  runtimeId?: string
  locations?: Array<string>
  tags?: Array<string>
  frequency?: number
  environmentVariables?: Array<EnvironmentVariable>
  groupId?: Ref
  alertChannels?: Array<AlertChannel>

  static readonly __checklyType = 'checks'

  constructor (logicalId: string, props: CheckProps) {
    super(logicalId)
    this.name = props.name
    this.activated = props.activated
    this.muted = props.muted
    this.doubleCheck = props.doubleCheck
    this.shouldFail = props.shouldFail
    this.locations = props.locations
    this.tags = props.tags
    this.frequency = props.frequency
    this.runtimeId = props.runtimeId
    this.environmentVariables = props.environmentVariables
    // Alert channel subscriptions will be synthesized separately in the Project construct.
    // This is due to the way things are organized on the BE.
    this.alertChannels = props.alertChannels ?? []
    this.groupId = props.groupId
    // alertSettings, useGlobalAlertSettings, groupId, groupOrder
  }

  addSubscriptions () {
    if (!this.alertChannels) {
      return
    }
    for (const alertChannel of this.alertChannels) {
      const subscription = new AlertChannelSubscription(`check-alert-channel-subscription#${this.logicalId}#${alertChannel.logicalId}`, {
        alertChannelId: { ref: alertChannel.logicalId },
        checkId: { ref: this.logicalId },
        activated: true,
      })
    }
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
      tags: this.tags,
      frequency: this.frequency,
      groupId: this.groupId,
      environmentVariables: this.environmentVariables,
    }
  }
}
