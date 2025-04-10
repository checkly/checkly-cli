import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel-codegen'

export interface SmsAlertChannelResource extends AlertChannelResource {
  type: 'SMS'
  config: {
    number: string
    name?: string
  }
}

const construct = 'SmsAlertChannel'

export class SmsAlertChannelCodegen extends Codegen<SmsAlertChannelResource> {
  prepare (logicalId: string, resource: SmsAlertChannelResource, context: Context): void {
    context.registerAlertChannel(
      resource.id,
      'smsAlert',
      this.program.generatedFile('resources/alert-channels/sms'),
    )
  }

  gencode (logicalId: string, resource: SmsAlertChannelResource, context: Context): void {
    const { id, file } = context.lookupAlertChannel(resource.id)

    file.import(construct, 'checkly/constructs')

    const { config } = resource

    file.section(decl(id, builder => {
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

      builder.export()
    }))
  }
}
