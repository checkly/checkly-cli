import { decl, expr, ident, Program } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel.codegen'

export interface EmailAlertChannelResource extends AlertChannelResource {
  type: 'EMAIL'
  config: {
    address: string
  }
}

const construct = 'EmailAlertChannel'

export function codegen (program: Program, logicalId: string, resource: EmailAlertChannelResource): void {
  program.import(construct, 'checkly/constructs')

  const id = program.registerVariable(
      `${construct}::${logicalId}`,
      ident(program.nth('emailAlert')),
  )

  program.section(decl(id, builder => {
    builder.variable(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.string('address', resource.config.address)

          buildAlertChannelProps(builder, resource)
        })
      })
    }))
  }))
}
