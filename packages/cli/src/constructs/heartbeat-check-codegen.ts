import { Codegen, Context } from './internal/codegen'
import { expr, ident, kebabCase } from '../sourcegen'
import { buildCheckProps, CheckResource } from './check-codegen'
import { Heartbeat } from './heartbeat-check'

export interface HeartbeatCheckResource extends CheckResource {
  checkType: 'HEARTBEAT'
  heartbeat: Heartbeat,
}

export class HeartbeatCheckCodegen extends Codegen<HeartbeatCheckResource> {
  gencode (logicalId: string, resource: HeartbeatCheckResource, context: Context): void {
    const file = this.program.generatedConstructFile(`resources/heartbeats/${kebabCase(resource.name)}`)

    file.namedImport('HeartbeatCheck', 'checkly/constructs')

    file.section(expr(ident('HeartbeatCheck'), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.number('period', resource.heartbeat.period)
          builder.string('periodUnit', resource.heartbeat.periodUnit)
          builder.number('grace', resource.heartbeat.grace)
          builder.string('graceUnit', resource.heartbeat.graceUnit)

          buildCheckProps(this.program, file, builder, resource, context)
        })
      })
    }))
  }
}
