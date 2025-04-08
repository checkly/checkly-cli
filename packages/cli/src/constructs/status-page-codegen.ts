import { Codegen, Context } from './internal/codegen'
import { expr, ident } from '../sourcegen'
import { StatusPageServiceResource } from './status-page-service-codegen'
import { StatusPageTheme } from './status-page'

export interface StatusPageCardResource {
  id: string
  name: string
  services: StatusPageServiceResource[]
}

export interface StatusPageResource {
  id: string
  name: string
  url: string
  cards: StatusPageCardResource[]
  customDomain?: string
  logo?: string
  redirectTo?: string
  favicon?: string
  defaultTheme?: StatusPageTheme
}

const construct = 'StatusPage'

export class StatusPageCodegen extends Codegen<StatusPageResource> {
  gencode (logicalId: string, resource: StatusPageResource, context: Context): void {
    this.program.import(construct, 'checkly/constructs')

    this.program.section(expr(ident(construct), builder => {
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
                      builder.value(serviceVariable)
                    } catch (err) {
                      throw new Error(`Status page '${resource.id}' refers to service '${service.id}' which is not being imported.`)
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
