import { decl, expr, ident, Program } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel.codegen'

export interface SmsAlertChannelResource extends AlertChannelResource {
  type: 'SMS'
  config: {
    number: string
    name?: string
  }
}

const construct = 'SmsAlertChannel'

export function codegen (program: Program, logicalId: string, resource: SmsAlertChannelResource): void {
  program.import(construct, 'checkly/constructs')

  const id = program.registerVariable(
      `${construct}::${logicalId}`,
      ident(program.nth('smsAlert')),
  )

  const { config } = resource

  program.section(decl(id, builder => {
    builder.variable(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          if (config.name) {
            builder.string('name', config.name)
          }

          builder.string('phoneNumber', config.number)

          buildAlertChannelProps(builder, resource)
        })
      })
    }))
  }))
}
