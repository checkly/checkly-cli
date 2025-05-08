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
  describe (resource: PagerdutyAlertChannelResource): string {
    if (resource.config.account) {
      return `Pagerduty Alert Channel: ${resource.config.account}`
    }

    if (resource.config.serviceName) {
      return `Pagerduty Alert Channel: ${resource.config.serviceName}`
    }

    return 'Pagerduty Alert Channel'
  }

  prepare (logicalId: string, resource: PagerdutyAlertChannelResource, context: Context): void {
    context.registerAlertChannel(
      resource.id,
      'pagerdutyAlert',
      this.program.generatedConstructFile('resources/alert-channels/pagerduty'),
    )
  }

  gencode (logicalId: string, resource: PagerdutyAlertChannelResource, context: Context): void {
    const { id, file } = context.lookupAlertChannel(resource.id)

    file.namedImport(construct, 'checkly/constructs')

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
