import { Codegen, Context } from './internal/codegen'
import { Program, GeneratedFile, ObjectValueBuilder, expr, ident, Value } from '../sourcegen'

import { EmailAlertChannelCodegen } from './email-alert-channel-codegen'
import { OpsgenieAlertChannelCodegen } from './opsgenie-alert-channel-codegen'
import { PagerdutyAlertChannelCodegen } from './pagerduty-alert-channel-codegen'
import { PhoneCallAlertChannelCodegen } from './phone-call-alert-channel-codegen'
import { SlackAlertChannelCodegen } from './slack-alert-channel-codegen'
import { SmsAlertChannelCodegen } from './sms-alert-channel-codegen'
import { WebhookAlertChannelCodegen } from './webhook-alert-channel-codegen'

export type AlertChannelType =
  'CALL'
  | 'EMAIL'
  | 'OPSGENIE'
  | 'PAGERDUTY'
  | 'SLACK'
  | 'SMS'
  | 'WEBHOOK'

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
  // The default value for sendRecovery is true, only include if false.
  if (resource.sendRecovery !== undefined && !resource.sendRecovery) {
    builder.boolean('sendRecovery', resource.sendRecovery)
  }

  // The default value for sendFailure is true, only include if false.
  if (resource.sendFailure !== undefined && !resource.sendFailure) {
    builder.boolean('sendFailure', resource.sendFailure)
  }

  // The default value for sendDegraded is false, only include if true.
  if (resource.sendDegraded !== undefined && resource.sendDegraded) {
    builder.boolean('sendDegraded', resource.sendDegraded)
  }

  // The default value for sslExpiry is false, only include if true.
  if (resource.sslExpiry !== undefined && resource.sslExpiry) {
    builder.boolean('sslExpiry', resource.sslExpiry)
  }

  // The default value for sslExpiryThreshold is 30, only include if other.
  if (resource.sslExpiryThreshold !== undefined && resource.sslExpiryThreshold !== 30) {
    builder.number('sslExpiryThreshold', resource.sslExpiryThreshold)
  }
}

const construct = 'AlertChannel'

export function valueForAlertChannelFromId (genfile: GeneratedFile, physicalId: number): Value {
  genfile.namedImport(construct, 'checkly/constructs')

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

  describe (resource: AlertChannelResource): string {
    const codegen = this.codegensByType[resource.type]
    if (codegen === undefined) {
      throw new Error(`Unable to describe unsupported alert channel type '${resource.type}'.`)
    }

    return codegen.describe(resource)
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
