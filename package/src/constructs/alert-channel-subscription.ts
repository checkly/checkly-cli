import { Ref } from './ref'
import { Construct } from './construct'

export interface AlertChannelSubscriptionProps {
    alertChannelId: Ref
    /**
     * You can either pass a checkId or a groupId, but not both.
     */
    checkId?: Ref
    /**
     * You can either pass a groupId or a checkId, but not both.
     */
    groupId?: Ref
    /**
     *  Determines if the suscription active or not.
     */
    activated: boolean
  }

/**
 * Creates an Alert Channel Subscription
 *
 * @remarks
 *
 * This class make use of the Alert Channel Subscriptions endpoints.
 */
export class AlertChannelSubscription extends Construct {
  alertChannelId: Ref
  checkId?: Ref
  groupId?: Ref
  activated: boolean

  static readonly __checklyType = 'alertChannelSubscriptions'

  /**
   * Constructs the Alert Channel Syscription instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props alert channel subscription configuration properties
   */
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
