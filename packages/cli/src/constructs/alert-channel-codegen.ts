import { Codegen, Context } from './internal/codegen'
import { Program, ObjectValueBuilder, expr, ident, Value } from '../sourcegen'

import { EmailAlertChannelCodegen } from './email-alert-channel-codegen'
import { OpsgenieAlertChannelCodegen } from './opsgenie-alert-channel-codegen'
import { PagerdutyAlertChannelCodegen } from './pagerduty-alert-channel-codegen'
import { PhoneCallAlertChannelCodegen } from './phone-call-alert-channel-codegen'
import { SlackAlertChannelCodegen } from './slack-alert-channel-codegen'
import { SmsAlertChannelCodegen } from './sms-alert-channel-codegen'
import { WebhookAlertChannelCodegen } from './webhook-alert-channel-codegen'

export type AlertChannelType =
  'CALL' |
  'EMAIL' |
  'OPSGENIE' |
  'PAGERDUTY' |
  'SLACK' |
  'SMS' |
  'WEBHOOK'

export interface AlertChannelResource {
  id: number
  type: AlertChannelType
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

const construct = 'AlertChannel'

export function valueForAlertChannelFromId (physicalId: number): Value {
  return expr(ident(construct), builder => {
    builder.member(ident('fromId'))
    builder.call(builder => {
      builder.number(physicalId)
    })
  })
}

export class AlertChannelCodegen extends Codegen<AlertChannelResource> {
  phoneCallCodegen: PhoneCallAlertChannelCodegen
  emailCodegen: EmailAlertChannelCodegen
  opsgenieCodegen: OpsgenieAlertChannelCodegen
  pagerdutyCodegen: PagerdutyAlertChannelCodegen
  slackCodegen: SlackAlertChannelCodegen
  smsCodegen: SmsAlertChannelCodegen
  webhookCodegen: WebhookAlertChannelCodegen
  codegensByType: Record<AlertChannelType, Codegen<any>>

  constructor (program: Program) {
    super(program)
    this.phoneCallCodegen = new PhoneCallAlertChannelCodegen(program)
    this.emailCodegen = new EmailAlertChannelCodegen(program)
    this.opsgenieCodegen = new OpsgenieAlertChannelCodegen(program)
    this.pagerdutyCodegen = new PagerdutyAlertChannelCodegen(program)
    this.slackCodegen = new SlackAlertChannelCodegen(program)
    this.smsCodegen = new SmsAlertChannelCodegen(program)
    this.webhookCodegen = new WebhookAlertChannelCodegen(program)

    this.codegensByType = {
      CALL: this.phoneCallCodegen,
      EMAIL: this.emailCodegen,
      OPSGENIE: this.opsgenieCodegen,
      PAGERDUTY: this.pagerdutyCodegen,
      SLACK: this.slackCodegen,
      SMS: this.smsCodegen,
      WEBHOOK: this.webhookCodegen,
    }
  }

  prepare (logicalId: string, resource: AlertChannelResource, context: Context): void {
    const codegen = this.codegensByType[resource.type]
    if (codegen === undefined) {
      throw new Error(`Unable to generate code for unsupported alert channel type '${resource.type}'.`)
    }

    codegen.prepare(logicalId, resource, context)
  }

  gencode (logicalId: string, resource: AlertChannelResource, context: Context): void {
    const codegen = this.codegensByType[resource.type]
    if (codegen === undefined) {
      throw new Error(`Unable to generate code for unsupported alert channel type '${resource.type}'.`)
    }

    codegen.gencode(logicalId, resource, context)
  }
}
