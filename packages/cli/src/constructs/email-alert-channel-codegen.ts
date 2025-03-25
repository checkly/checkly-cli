import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel-codegen'

export interface EmailAlertChannelResource extends AlertChannelResource {
  type: 'EMAIL'
  config: {
    address: string
  }
}

const construct = 'EmailAlertChannel'

export class EmailAlertChannelCodegen extends Codegen<EmailAlertChannelResource> {
  prepare (logicalId: string, resource: EmailAlertChannelResource, context: Context): void {
    context.registerAlertChannel(resource.id, 'emailAlert')
  }

  gencode (logicalId: string, resource: EmailAlertChannelResource, context: Context): void {
    this.program.import(construct, 'checkly/constructs')

    const id = context.lookupAlertChannel(resource.id)

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
