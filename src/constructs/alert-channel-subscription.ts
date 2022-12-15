import Ref from './ref'
import Construct from './construct'

export interface AlertChannelSubscriptionProps {
    alertChannelId: Ref
    checkId: Ref
    activated: boolean
  }

class AlertChannelSubscription extends Construct {
  alertChannelId: Ref
  checkId: Ref
  activated: boolean
  constructor (logicalId: string, props: AlertChannelSubscriptionProps) {
    super(logicalId)
    this.alertChannelId = props.alertChannelId
    this.checkId = props.checkId
    this.activated = props.activated
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
