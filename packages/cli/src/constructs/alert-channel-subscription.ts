import { Ref, sourceForRef } from './ref'
import { Construct } from './construct'
import { Session } from './project'
import { expr, ident, Program } from '../sourcegen'

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

  static readonly __checklyType = 'alert-channel-subscription'

  /**
   * Constructs the Alert Channel Syscription instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props alert channel subscription configuration properties
   */
  constructor (logicalId: string, props: AlertChannelSubscriptionProps) {
    super(AlertChannelSubscription.__checklyType, logicalId)
    this.alertChannelId = props.alertChannelId
    this.checkId = props.checkId
    this.groupId = props.groupId
    this.activated = props.activated
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      alertChannelId: this.alertChannelId,
      checkId: this.checkId,
      groupId: this.groupId,
      activated: this.activated,
    }
  }

  source (program: Program): void {
    program.import('AlertChannelSubscription', 'checkly/constructs')

    program.section(expr(ident('AlertChannelSubscription'), builder => {
      builder.new(builder => {
        builder.string(this.logicalId)
        builder.object(builder => {
          builder.value('alertChannelId', sourceForRef(program, this.alertChannelId))

          if (this.checkId) {
            builder.value('checkId', sourceForRef(program, this.checkId))
          }

          if (this.groupId) {
            builder.value('groupId', sourceForRef(program, this.groupId))
          }

          builder.boolean('activated', this.activated)
        })
      })
    }))
  }
}
