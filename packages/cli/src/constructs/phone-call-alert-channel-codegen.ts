import { Codegen, Context } from './internal/codegen'
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
  describe (resource: PhoneCallAlertChannelResource): string {
    if (resource.config.name) {
      return `Phone Call Alert Channel: ${resource.config.name}`
    }

    return `Phone Call Alert Channel: ${resource.config.number}`
  }

  prepare (logicalId: string, resource: PhoneCallAlertChannelResource, context: Context): void {
    const { name, number } = resource.config

    const last4Digits = number.slice(-4)
    const fallbackName = `phone-call-${last4Digits}`

    const filename = context.filePath('resources/alert-channels/phone-call', name || fallbackName, {
      unique: true,
    })

    context.registerAlertChannel(
      resource.id,
      name ? `${name} phone call` : fallbackName,
      this.program.generatedConstructFile(filename.fullPath),
    )
  }

  gencode (logicalId: string, resource: PhoneCallAlertChannelResource, context: Context): void {
    const { id, file } = context.lookupAlertChannel(resource.id)

    file.namedImport(construct, 'checkly/constructs')

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
