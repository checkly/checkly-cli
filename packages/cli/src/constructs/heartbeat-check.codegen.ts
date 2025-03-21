import { expr, ident, Program } from '../sourcegen'
import { buildCheckProps, CheckResource } from './check.codegen'
import { Heartbeat } from './heartbeat-check'

export interface HeartbeatCheckResource extends CheckResource {
  checkType: 'HEARTBEAT'
  heartbeat: Heartbeat,
}

export function source (program: Program, logicalId: string, resource: HeartbeatCheckResource): void {
  program.import('HeartbeatCheck', 'checkly/constructs')

  program.section(expr(ident('HeartbeatCheck'), builder => {
    builder.new(builder => {
      builder.string(logicalId)
      builder.object(builder => {
        builder.number('period', resource.heartbeat.period)
        builder.string('periodUnit', resource.heartbeat.periodUnit)
        builder.number('grace', resource.heartbeat.grace)
        builder.string('graceUnit', resource.heartbeat.graceUnit)

        buildCheckProps(program, builder, resource)
      })
    })
  }))
}
