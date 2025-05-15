import { Codegen, Context } from './internal/codegen'
import { expr, ident } from '../sourcegen'

export interface DashboardResource {
  tags?: string[]
  customUrl?: string
  customDomain?: string
  logo?: string
  favicon?: string
  link?: string
  header?: string
  description?: string
  width?: string
  refreshRate?: number
  paginate?: boolean
  paginationRate?: number
  checksPerPage?: number
  useTagsAndOperator?: boolean
  hideTags?: boolean
  enableIncidents?: boolean
  expandChecks?: boolean
  showHeader?: boolean
  customCSS?: string
  isPrivate?: boolean
  showP95?: boolean
  showP99?: boolean
}

const construct = 'Dashboard'

export class DashboardCodegen extends Codegen<DashboardResource> {
  describe (resource: DashboardResource): string {
    if (resource.header) {
      return `Dashboard: ${resource.header}`
    }

    return 'Dashboard'
  }

  gencode (logicalId: string, resource: DashboardResource, context: Context): void {
    const filePath = context.filePath('resources/dashboards', resource.header ?? logicalId, {
      isolate: true,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          if (resource.tags) {
            const tags = resource.tags
            if (tags.length > 0) {
              builder.array('tags', builder => {
                for (const tag of tags) {
                  builder.string(tag)
                }
              })
            }
          }

          if (resource.customUrl) {
            builder.string('customUrl', resource.customUrl)
          }

          if (resource.customDomain) {
            builder.string('customDomain', resource.customDomain)
          }

          if (resource.logo) {
            builder.string('logo', resource.logo)
          }

          if (resource.favicon) {
            builder.string('favicon', resource.favicon)
          }

          if (resource.link) {
            builder.string('link', resource.link)
          }

          if (resource.header) {
            builder.string('header', resource.header)
          }

          if (resource.description) {
            builder.string('description', resource.description)
          }

          if (resource.width) {
            builder.string('width', resource.width)
          }

          if (resource.refreshRate) {
            builder.number('refreshRate', resource.refreshRate)
          }

          if (resource.paginate !== undefined) {
            builder.boolean('paginate', resource.paginate)
          }

          if (resource.paginationRate) {
            builder.number('paginationRate', resource.paginationRate)
          }

          if (resource.checksPerPage) {
            builder.number('checksPerPage', resource.checksPerPage)
          }

          if (resource.useTagsAndOperator !== undefined) {
            builder.boolean('useTagsAndOperator', resource.useTagsAndOperator)
          }

          if (resource.hideTags !== undefined) {
            builder.boolean('hideTags', resource.hideTags)
          }

          if (resource.enableIncidents !== undefined) {
            builder.boolean('enableIncidents', resource.enableIncidents)
          }

          if (resource.expandChecks !== undefined) {
            builder.boolean('expandChecks', resource.expandChecks)
          }

          if (resource.showHeader !== undefined) {
            builder.boolean('showHeader', resource.showHeader)
          }

          if (resource.customCSS) {
            const content = resource.customCSS
            builder.object('customCSS', builder => {
              const cssFile = this.program.staticStyleFile(`${file.dirname}/style`, content)
              builder.string('entrypoint', file.relativePath(cssFile))
            })
          }

          if (resource.isPrivate !== undefined) {
            builder.boolean('isPrivate', resource.isPrivate)
          }

          if (resource.showP95 !== undefined) {
            builder.boolean('showP95', resource.showP95)
          }

          if (resource.showP99 !== undefined) {
            builder.boolean('showP99', resource.showP99)
          }
        })
      })
    }))
  }
}
