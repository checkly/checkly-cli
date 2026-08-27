import { Codegen, Context } from './internal/codegen/index.js'
import { expr, ident, Program } from '../sourcegen/index.js'
import { StatusPageServiceResource, valueForStatusPageServiceFromId } from './status-page-service-codegen.js'
import { StatusPageTheme } from './status-page.js'
import { StatusPageV3Codegen, StatusPageV3Resource } from './status-page-v3-codegen.js'

export interface StatusPageCardResource {
  id: string
  name: string
  services: StatusPageServiceResource[]
}

export interface StatusPageV2Resource {
  id: string
  name: string
  url: string
  version?: 2
  cards: StatusPageCardResource[]
  customDomain?: string
  logo?: string
  redirectTo?: string
  favicon?: string
  defaultTheme?: StatusPageTheme
}

// Both generations share the `status-page` resource type; the payload's
// `version` tells them apart.
export type StatusPageResource = StatusPageV2Resource | StatusPageV3Resource

function isV3 (resource: StatusPageResource): resource is StatusPageV3Resource {
  return resource.version === 3
}

const construct = 'StatusPage'

export class StatusPageCodegen extends Codegen<StatusPageResource> {
  v3Codegen: StatusPageV3Codegen

  constructor (program: Program) {
    super(program)
    this.v3Codegen = new StatusPageV3Codegen(program)
  }

  describe (resource: StatusPageResource): string {
    if (isV3(resource)) {
      return this.v3Codegen.describe(resource)
    }

    return `Status Page: ${resource.name}`
  }

  prepare (logicalId: string, resource: StatusPageResource, context: Context): void {
    if (isV3(resource)) {
      this.v3Codegen.prepare(logicalId, resource, context)
    }
  }

  gencode (logicalId: string, resource: StatusPageResource, context: Context): void {
    if (isV3(resource)) {
      this.v3Codegen.gencode(logicalId, resource, context)
      return
    }

    const filePath = context.filePath('resources/status-pages', resource.name, {
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.string('name', resource.name)
          builder.string('url', resource.url)

          builder.array('cards', builder => {
            for (const card of resource.cards) {
              builder.object(builder => {
                builder.string('name', card.name)
                builder.array('services', builder => {
                  for (const service of card.services) {
                    try {
                      const serviceVariable = context.lookupStatusPageService(service.id)
                      const id = context.importVariable(serviceVariable, file)
                      builder.value(id)
                    } catch {
                      try {
                        const serviceVariable = context.lookupFriendStatusPageService(service.id)
                        const id = context.importFriendVariable(serviceVariable, file)
                        builder.value(id)
                      } catch {
                        builder.value(valueForStatusPageServiceFromId(file, service.id))
                      }
                    }
                  }
                })
              })
            }
          })

          if (resource.customDomain) {
            builder.string('customDomain', resource.customDomain)
          }

          if (resource.logo) {
            builder.string('logo', resource.logo)
          }

          if (resource.redirectTo) {
            builder.string('redirectTo', resource.redirectTo)
          }

          if (resource.favicon) {
            builder.string('favicon', resource.favicon)
          }

          if (resource.defaultTheme) {
            builder.string('defaultTheme', resource.defaultTheme)
          }
        })
      })
    }))
  }
}
