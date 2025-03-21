import { Program, ObjectValueBuilder } from '../sourcegen'

import { codegen as emailAlertChannelCodegen, EmailAlertChannelResource } from './email-alert-channel.codegen'
import { codegen as opsgenieAlertChannelCodegen, OpsgenieAlertChannelResource } from './opsgenie-alert-channel.codegen'
import { codegen as pagerdutyAlertChannelCodegen, PagerdutyAlertChannelResource } from './pagerduty-alert-channel.codegen'
import { codegen as phoneCallAlertChannelCodegen, PhoneCallAlertChannelResource } from './phone-call-alert-channel.codegen'
import { codegen as slackAlertChannelCodegen, SlackAlertChannelResource } from './slack-alert-channel.codegen'
import { codegen as smsAlertChannelCodegen, SmsAlertChannelResource } from './sms-alert-channel.codegen'
import { codegen as webhookAlertChannelCodegen, WebhookAlertChannelResource } from './webhook-alert-channel.codegen'

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

type Type = 'CALL' | 'EMAIL' | 'OPSGENIE' | 'PAGERDUTY' | 'SLACK' | 'SMS' | 'WEBHOOK'

const codegensByType = {
  CALL: (program: Program, logicalId: string, resource: AlertChannelResource) => {
    return phoneCallAlertChannelCodegen(program, logicalId, resource as PhoneCallAlertChannelResource)
  },
  EMAIL: (program: Program, logicalId: string, resource: AlertChannelResource) => {
    return emailAlertChannelCodegen(program, logicalId, resource as EmailAlertChannelResource)
  },
  OPSGENIE: (program: Program, logicalId: string, resource: AlertChannelResource) => {
    return opsgenieAlertChannelCodegen(program, logicalId, resource as OpsgenieAlertChannelResource)
  },
  PAGERDUTY: (program: Program, logicalId: string, resource: AlertChannelResource) => {
    return pagerdutyAlertChannelCodegen(program, logicalId, resource as PagerdutyAlertChannelResource)
  },
  SLACK: (program: Program, logicalId: string, resource: AlertChannelResource) => {
    return slackAlertChannelCodegen(program, logicalId, resource as SlackAlertChannelResource)
  },
  SMS: (program: Program, logicalId: string, resource: AlertChannelResource) => {
    return smsAlertChannelCodegen(program, logicalId, resource as SmsAlertChannelResource)
  },
  WEBHOOK: (program: Program, logicalId: string, resource: AlertChannelResource) => {
    return webhookAlertChannelCodegen(program, logicalId, resource as WebhookAlertChannelResource)
  },
}

export function codegen (program: Program, logicalId: string, resource: AlertChannelResource): void {
  const subgen = codegensByType[resource.type as Type]
  if (!subgen) {
    throw new Error(`Unable to generate for for unsupported alert channel type '${resource.type}'.`)
  }

  return subgen(program, logicalId, resource)
}
