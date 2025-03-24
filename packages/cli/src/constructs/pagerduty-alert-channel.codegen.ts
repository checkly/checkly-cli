import { Codegen } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel.codegen'

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
  gencode (logicalId: string, resource: PagerdutyAlertChannelResource): void {
    this.program.import(construct, 'checkly/constructs')

    const id = this.program.registerVariable(
      `${construct}::${logicalId}`,
      ident(this.program.nth('pagerdutyAlert')),
    )

    const { config } = resource

    this.program.section(decl(id, builder => {
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
    }))
  }
}
