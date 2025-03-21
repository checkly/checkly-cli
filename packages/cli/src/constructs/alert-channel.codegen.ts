import { decl, expr, ident, Program, ObjectValueBuilder } from '../sourcegen'

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

const construct = 'AlertChannel'

export function codegen (program: Program, logicalId: string, resource: AlertChannelResource): void {
  program.import(construct, 'checkly/constructs')

  const id = program.registerVariable(
      `${construct}::${logicalId}`,
      ident(program.nth('alertChannel')),
  )

  program.section(decl(id, builder => {
    builder.variable(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          buildAlertChannelProps(builder, resource)
        })
      })
    }))
  }))
}
