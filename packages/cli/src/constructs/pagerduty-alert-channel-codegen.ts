import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel-codegen'

export interface PagerdutyAlertChannelResource extends AlertChannelResource {
  type: 'PAGERDUTY'
  config: {
    account?: string
    serviceName?: string
    serviceKey: string
  }
}

const construct = 'PagerdutyAlertChannel'

export class PagerdutyAlertChannelCodegen extends Codegen<PagerdutyAlertChannelResource> {
  prepare (logicalId: string, resource: PagerdutyAlertChannelResource, context: Context): void {
    context.registerAlertChannel(
      resource.id,
      'pagerdutyAlert',
      this.program.generatedFile('resources/alert-channels/pagerduty'),
    )
  }

  gencode (logicalId: string, resource: PagerdutyAlertChannelResource, context: Context): void {
    const { id, file } = context.lookupAlertChannel(resource.id)

    file.import(construct, 'checkly/constructs')

    const { config } = resource

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            if (config.account) {
              builder.string('account', config.account)
            }

            if (config.serviceName) {
              builder.string('serviceName', config.serviceName)
            }

            builder.string('serviceKey', config.serviceKey)

            buildAlertChannelProps(builder, resource)
          })
        })
      }))

      builder.export()
    }))
  }
}
