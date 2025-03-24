import { Codegen } from './internal/codegen'
import { Program, ObjectValueBuilder } from '../sourcegen'

import { EmailAlertChannelCodegen, EmailAlertChannelResource } from './email-alert-channel-codegen'
import { OpsgenieAlertChannelCodegen, OpsgenieAlertChannelResource } from './opsgenie-alert-channel-codegen'
import { PagerdutyAlertChannelCodegen, PagerdutyAlertChannelResource } from './pagerduty-alert-channel-codegen'
import { PhoneCallAlertChannelCodegen, PhoneCallAlertChannelResource } from './phone-call-alert-channel-codegen'
import { SlackAlertChannelCodegen, SlackAlertChannelResource } from './slack-alert-channel-codegen'
import { SmsAlertChannelCodegen, SmsAlertChannelResource } from './sms-alert-channel-codegen'
import { WebhookAlertChannelCodegen, WebhookAlertChannelResource } from './webhook-alert-channel-codegen'

export interface AlertChannelResource {
  type: string
  sendRecovery: boolean
  sendFailure: boolean
  sendDegraded: boolean
  sslExpiry: boolean
  sslExpiryThreshold: number
}

export function buildAlertChannelProps (builder: ObjectValueBuilder, resource: AlertChannelResource): void {
  if (resource.sendRecovery !== undefined) {
    builder.boolean('sendRecovery', resource.sendRecovery)
  }

  if (resource.sendFailure !== undefined) {
    builder.boolean('sendFailure', resource.sendFailure)
  }

  if (resource.sendDegraded !== undefined) {
    builder.boolean('sendDegraded', resource.sendDegraded)
  }

  if (resource.sslExpiry !== undefined) {
    builder.boolean('sslExpiry', resource.sslExpiry)
  }

  if (resource.sslExpiryThreshold !== undefined) {
    builder.number('sslExpiryThreshold', resource.sslExpiryThreshold)
  }
}

export class AlertChannelCodegen extends Codegen<AlertChannelResource> {
  phoneCallCodegen: PhoneCallAlertChannelCodegen
  emailCodegen: EmailAlertChannelCodegen
  opsgenieCodegen: OpsgenieAlertChannelCodegen
  pagerdutyCodegen: PagerdutyAlertChannelCodegen
  slackCodegen: SlackAlertChannelCodegen
  smsCodegen: SmsAlertChannelCodegen
  webhookCodegen: WebhookAlertChannelCodegen

  constructor (program: Program) {
    super(program)
    this.phoneCallCodegen = new PhoneCallAlertChannelCodegen(program)
    this.emailCodegen = new EmailAlertChannelCodegen(program)
    this.opsgenieCodegen = new OpsgenieAlertChannelCodegen(program)
    this.pagerdutyCodegen = new PagerdutyAlertChannelCodegen(program)
    this.slackCodegen = new SlackAlertChannelCodegen(program)
    this.smsCodegen = new SmsAlertChannelCodegen(program)
    this.webhookCodegen = new WebhookAlertChannelCodegen(program)
  }

  gencode (logicalId: string, resource: AlertChannelResource): void {
    switch (resource.type) {
      case 'CALL':
        return this.phoneCallCodegen.gencode(logicalId, resource as PhoneCallAlertChannelResource)
      case 'EMAIL':
        return this.emailCodegen.gencode(logicalId, resource as EmailAlertChannelResource)
      case 'OPSGENIE':
        return this.opsgenieCodegen.gencode(logicalId, resource as OpsgenieAlertChannelResource)
      case 'PAGERDUTY':
        return this.pagerdutyCodegen.gencode(logicalId, resource as PagerdutyAlertChannelResource)
      case 'SLACK':
        return this.slackCodegen.gencode(logicalId, resource as SlackAlertChannelResource)
      case 'SMS':
        return this.smsCodegen.gencode(logicalId, resource as SmsAlertChannelResource)
      case 'WEBHOOK':
        return this.webhookCodegen.gencode(logicalId, resource as WebhookAlertChannelResource)
      default:
        throw new Error(`Unable to generate code for unsupported alert channel type '${resource.type}'.`)
    }
  }
}
