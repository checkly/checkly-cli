import Ref from './ref'
import Construct from './construct'

const __checklyType = 'alertChannelSubscriptions'
export interface AlertChannelSubscriptionProps {
    alertChannelId: Ref
    checkId?: Ref
    groupId?: Ref
    activated: boolean
  }

class AlertChannelSubscription extends Construct {
  alertChannelId: Ref
  checkId?: Ref
  groupId?: Ref
  activated: boolean
  constructor (logicalId: string, props: AlertChannelSubscriptionProps) {
    super(logicalId)
    this.alertChannelId = props.alertChannelId
    this.checkId = props.checkId
    this.groupId = props.groupId
    this.activated = props.activated
    this.register(__checklyType, this.logicalId, this.synthesize())
  }

  synthesize () {
    return {
      alertChannelId: this.alertChannelId,
      checkId: this.checkId,
      activated: this.activated,
    }
  }
}

export default AlertChannelSubscription
