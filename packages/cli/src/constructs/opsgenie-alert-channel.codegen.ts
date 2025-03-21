import { decl, expr, ident, Program } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel.codegen'

export interface OpsgenieAlertChannelResource extends AlertChannelResource {
  type: 'OPSGENIE'
  config: {
    name: string
    apiKey: string
    region: string
    priority: string
  }
}

const construct = 'OpsgenieAlertChannel'

export function codegen (program: Program, logicalId: string, resource: OpsgenieAlertChannelResource): void {
  program.import(construct, 'checkly/constructs')

  const id = program.registerVariable(
      `${construct}::${logicalId}`,
      ident(program.nth('opsgenieAlert')),
  )

  const { config } = resource

  program.section(decl(id, builder => {
    builder.variable(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.string('name', config.name)
          builder.string('apiKey', config.apiKey)
          builder.string('region', config.region)
          builder.string('priority', config.priority)

          buildAlertChannelProps(builder, resource)
        })
      })
    }))
  }))
}
