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
    context.registerAlertChannel(
      resource.id,
      'emailAlert',
      this.program.generatedConstructFile('resources/alert-channels/email'),
    )
  }

  gencode (logicalId: string, resource: EmailAlertChannelResource, context: Context): void {
    const { id, file } = context.lookupAlertChannel(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.string('address', resource.config.address)

            buildAlertChannelProps(builder, resource)
          })
        })
      }))

      builder.export()
    }))
  }
}
