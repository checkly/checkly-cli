import { Codegen } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel.codegen'

export interface EmailAlertChannelResource extends AlertChannelResource {
  type: 'EMAIL'
  config: {
    address: string
  }
}

const construct = 'EmailAlertChannel'

export class EmailAlertChannelCodegen extends Codegen<EmailAlertChannelResource> {
  gencode (logicalId: string, resource: EmailAlertChannelResource): void {
    this.program.import(construct, 'checkly/constructs')

    const id = this.program.registerVariable(
      `${construct}::${logicalId}`,
      ident(this.program.nth('emailAlert')),
    )

    this.program.section(decl(id, builder => {
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
}
