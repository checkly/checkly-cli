import { Codegen } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel-codegen'

export interface PhoneCallAlertChannelResource extends AlertChannelResource {
  type: 'CALL'
  config: {
    number: string
    name?: string
  }
}

const construct = 'PhoneCallAlertChannel'

export class PhoneCallAlertChannelCodegen extends Codegen<PhoneCallAlertChannelResource> {
  gencode (logicalId: string, resource: PhoneCallAlertChannelResource): void {
    this.program.import(construct, 'checkly/constructs')

    const id = this.program.registerVariable(
      `${construct}::${logicalId}`,
      ident(this.program.nth('phoneCallAlert')),
    )

    const { config } = resource

    this.program.section(decl(id, builder => {
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
}
