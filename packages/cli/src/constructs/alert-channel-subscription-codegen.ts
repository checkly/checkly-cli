import { Codegen, Context } from './internal/codegen'

export interface AlertChannelSubscriptionResource {
  alertChannelId: number
  groupId?: number
  checkId?: string
}

export class AlertChannelSubscriptionCodegen extends Codegen<AlertChannelSubscriptionResource> {
  describe (resource: AlertChannelSubscriptionResource): string {
    return 'Alert Channel Subscription'
  }

  prepare (logicalId: string, resource: AlertChannelSubscriptionResource, context: Context): void {
    if (resource.checkId !== undefined) {
      context.registerAlertChannelCheckSubscription(resource.alertChannelId, resource.checkId)
    }

    if (resource.groupId !== undefined) {
      context.registerAlertChannelGroupSubscription(resource.alertChannelId, resource.groupId)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  gencode (logicalId: string, resource: AlertChannelSubscriptionResource, context: Context): void {
    // Nothing to generate for this resource.
  }
}
