import { Ref } from './ref'
import { Construct } from './construct'
export interface AlertChannelSubscriptionProps {
    alertChannelId: Ref
    checkId?: Ref
    groupId?: Ref
    activated: boolean
  }

export class AlertChannelSubscription extends Construct {
  alertChannelId: Ref
  checkId?: Ref
  groupId?: Ref
  activated: boolean

  static readonly __checklyType = 'alertChannelSubscriptions'
  constructor (logicalId: string, props: AlertChannelSubscriptionProps) {
    super(logicalId)
    this.alertChannelId = props.alertChannelId
    this.checkId = props.checkId
    this.groupId = props.groupId
    this.activated = props.activated
    this.register(AlertChannelSubscription.__checklyType, this.logicalId, this.synthesize())
  }

  synthesize () {
    return {
      alertChannelId: this.alertChannelId,
      checkId: this.checkId,
      groupId: this.groupId,
      activated: this.activated,
    }
  }
}
