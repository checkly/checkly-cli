import { Codegen, Context } from './internal/codegen/index.js'
import { expr, ident } from '../sourcegen/index.js'
import { StatusPageV3TargetImpact } from './status-page-v3-automation-rule.js'
import { valueForStatusPageV3Ref } from './status-page-v3-codegen.js'
import { valueForStatusPageV3ComponentRef } from './status-page-v3-component-codegen.js'

export interface StatusPageV3AutomationRuleComponentResource {
  componentId: string
  targetImpact: StatusPageV3TargetImpact
}

export interface StatusPageV3AutomationRuleResource {
  id: string
  statusPageId: string
  name: string
  enabled?: boolean | null
  firstUpdate: string
  lastUpdate: string
  notifySubscribers?: boolean | null
  tags: string[]
  coolDownWindowMinutes?: number | null
  components: StatusPageV3AutomationRuleComponentResource[]
}

const construct = 'StatusPageV3AutomationRule'

export class StatusPageV3AutomationRuleCodegen extends Codegen<StatusPageV3AutomationRuleResource> {
  describe (resource: StatusPageV3AutomationRuleResource): string {
    return `Status Page Automation Rule: ${resource.name}`
  }

  gencode (logicalId: string, resource: StatusPageV3AutomationRuleResource, context: Context): void {
    const filePath = context.filePath('resources/status-pages/automation-rules', resource.name, {
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.value('statusPage', valueForStatusPageV3Ref(file, resource.statusPageId, context))
          builder.string('name', resource.name)

          if (resource.enabled === false) {
            builder.boolean('enabled', false)
          }

          builder.string('firstUpdate', resource.firstUpdate)
          builder.string('lastUpdate', resource.lastUpdate)

          if (resource.notifySubscribers === false) {
            builder.boolean('notifySubscribers', false)
          }

          builder.array('tags', builder => {
            for (const tag of resource.tags) {
              builder.string(tag)
            }
          })

          if (resource.coolDownWindowMinutes !== undefined && resource.coolDownWindowMinutes !== null) {
            builder.number('coolDownMinutes', resource.coolDownWindowMinutes)
          }

          builder.array('components', builder => {
            for (const { componentId, targetImpact } of resource.components) {
              builder.object(builder => {
                builder.value('component', valueForStatusPageV3ComponentRef(file, componentId, context))
                builder.string('targetImpact', targetImpact)
              })
            }
          })
        })
      })
    }))
  }
}
