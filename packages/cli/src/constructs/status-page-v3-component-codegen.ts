import { Codegen, Context } from './internal/codegen/index.js'
import { decl, expr, GeneratedFile, ident, Value } from '../sourcegen/index.js'
import { StatusPageV3ComponentType } from './status-page-v3-component.js'
import { valueForStatusPageV3Ref } from './status-page-v3-codegen.js'

export interface StatusPageV3ComponentResource {
  id: string
  statusPageId: string
  parentId?: string | null
  type: StatusPageV3ComponentType
  name: string
  description?: string | null
  hidden?: boolean | null
  displayOrder: number
}

const construct = 'StatusPageV3Component'

export function valueForStatusPageV3ComponentFromId (genfile: GeneratedFile, physicalId: string): Value {
  genfile.namedImport(construct, 'checkly/constructs')

  return expr(ident(construct), builder => {
    builder.member(ident('fromId'))
    builder.call(builder => {
      builder.string(physicalId)
    })
  })
}

/**
 * Resolves a reference to a component: an imported component, one already
 * declared in the project (friend), or a `fromId()` reference as fallback.
 */
export function valueForStatusPageV3ComponentRef (
  genfile: GeneratedFile,
  physicalId: string,
  context: Context,
): Value {
  try {
    const variable = context.lookupStatusPageComponent(physicalId)
    return context.importVariable(variable, genfile)
  } catch {
    try {
      const variable = context.lookupFriendStatusPageComponent(physicalId)
      return context.importFriendVariable(variable, genfile)
    } catch {
      return valueForStatusPageV3ComponentFromId(genfile, physicalId)
    }
  }
}

export class StatusPageV3ComponentCodegen extends Codegen<StatusPageV3ComponentResource> {
  describe (resource: StatusPageV3ComponentResource): string {
    return `Status Page Component: ${resource.name}`
  }

  prepare (logicalId: string, resource: StatusPageV3ComponentResource, context: Context): void {
    const filePath = context.filePath('resources/status-pages/components', resource.name, {
      unique: true,
    })

    context.registerStatusPageComponent(
      resource.id,
      resource.name,
      this.program.generatedConstructFile(filePath.fullPath),
    )
  }

  gencode (logicalId: string, resource: StatusPageV3ComponentResource, context: Context): void {
    const { id, file } = context.lookupStatusPageComponent(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.value('statusPage', valueForStatusPageV3Ref(file, resource.statusPageId, context))

            // SERVICE is the construct's default.
            if (resource.type === 'GROUP') {
              builder.string('type', resource.type)
            }

            builder.string('name', resource.name)

            if (resource.description) {
              builder.string('description', resource.description)
            }

            if (resource.hidden === true) {
              builder.boolean('hidden', true)
            }

            builder.number('displayOrder', resource.displayOrder)

            if (resource.parentId) {
              builder.value('parent', valueForStatusPageV3ComponentRef(file, resource.parentId, context))
            }
          })
        })
      }))

      builder.export()
    }))
  }
}
