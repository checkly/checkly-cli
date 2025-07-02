import { Codegen, Context } from './internal/codegen'
import { expr, ident } from '../sourcegen'
import { buildMonitorProps, MonitorResource } from './monitor-codegen'
import { Heartbeat } from './heartbeat-monitor'

export interface HeartbeatMonitorResource extends MonitorResource {
  checkType: 'HEARTBEAT'
  heartbeat: Heartbeat,
}

export class HeartbeatMonitorCodegen extends Codegen<HeartbeatMonitorResource> {
  describe (resource: HeartbeatMonitorResource): string {
    return `Heartbeat Monitor: ${resource.name}`
  }

  gencode (logicalId: string, resource: HeartbeatMonitorResource, context: Context): void {
    const filePath = context.filePath('resources/heartbeat-monitors', resource.name, {
      tags: resource.tags,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport('HeartbeatMonitor', 'checkly/constructs')

    file.section(expr(ident('HeartbeatMonitor'), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.number('period', resource.heartbeat.period)
          builder.string('periodUnit', resource.heartbeat.periodUnit)
          builder.number('grace', resource.heartbeat.grace)
          builder.string('graceUnit', resource.heartbeat.graceUnit)

          buildMonitorProps(this.program, file, builder, resource, context)
        })
      })
    }))
  }
}
