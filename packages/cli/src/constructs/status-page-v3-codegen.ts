import { Codegen, Context } from './internal/codegen/index.js'
import { statusPageV3ThemeColorProperties, statusPageV3Themes } from './internal/status-page-v3-theme-colors.js'
import { decl, expr, GeneratedFile, ident, Value } from '../sourcegen/index.js'
import { StatusPageTheme } from './status-page.js'
import type { StatusPageV3ThemeColors } from './status-page-v3.js'

export interface StatusPageV3Resource {
  id: string
  name: string
  url: string
  version: 3
  customDomain?: string | null
  description?: string | null
  logo?: string | null
  logoDark?: string | null
  redirectTo?: string | null
  favicon?: string | null
  defaultTheme?: StatusPageTheme | null
  privacyPolicyLink?: string | null
  termsOfServiceLink?: string | null
  supportLink?: string | null
  footerText?: string | null
  googleAnalyticsTag?: string | null
  allowIndexing?: boolean | null
  themeColors?: StatusPageV3ThemeColors | null
}

const construct = 'StatusPageV3'

// The stored palette is complete, so every color is generated as-is: the CLI
// does not know the backend defaults and must not guess which ones to omit.
function themeColorEntries (themeColors: StatusPageV3ThemeColors): Array<[string, Array<[string, string]>]> {
  const themes: Array<[string, Array<[string, string]>]> = []
  for (const theme of statusPageV3Themes) {
    const colors = themeColors[theme]
    if (!colors) {
      continue
    }
    const entries: Array<[string, string]> = []
    for (const property of statusPageV3ThemeColorProperties) {
      const value = colors[property]
      if (value) {
        entries.push([property, value])
      }
    }
    if (entries.length > 0) {
      themes.push([theme, entries])
    }
  }
  return themes
}

export function valueForStatusPageV3FromId (genfile: GeneratedFile, physicalId: string): Value {
  genfile.namedImport(construct, 'checkly/constructs')

  return expr(ident(construct), builder => {
    builder.member(ident('fromId'))
    builder.call(builder => {
      builder.string(physicalId)
    })
  })
}

/**
 * Resolves a reference to a v3 status page: an imported page, a page already
 * declared in the project (friend), or a `fromId()` reference as fallback.
 */
export function valueForStatusPageV3Ref (
  genfile: GeneratedFile,
  physicalId: string,
  context: Context,
): Value {
  try {
    const variable = context.lookupStatusPage(physicalId)
    return context.importVariable(variable, genfile)
  } catch {
    try {
      const variable = context.lookupFriendStatusPage(physicalId)
      return context.importFriendVariable(variable, genfile)
    } catch {
      return valueForStatusPageV3FromId(genfile, physicalId)
    }
  }
}

/**
 * v2 and v3 pages share the `status-page` resource type. `StatusPageCodegen`
 * dispatches here when the payload carries `version: 3`.
 */
export class StatusPageV3Codegen extends Codegen<StatusPageV3Resource> {
  describe (resource: StatusPageV3Resource): string {
    return `Status Page (v3): ${resource.name}`
  }

  prepare (logicalId: string, resource: StatusPageV3Resource, context: Context): void {
    const filePath = context.filePath('resources/status-pages', resource.name, {
      unique: true,
    })

    context.registerStatusPage(
      resource.id,
      resource.name,
      this.program.generatedConstructFile(filePath.fullPath),
    )
  }

  gencode (logicalId: string, resource: StatusPageV3Resource, context: Context): void {
    const { id, file } = context.lookupStatusPage(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.string('name', resource.name)
            builder.string('url', resource.url)

            if (resource.customDomain) {
              builder.string('customDomain', resource.customDomain)
            }

            if (resource.description) {
              builder.string('description', resource.description)
            }

            if (resource.logo) {
              builder.string('logo', resource.logo)
            }

            if (resource.logoDark) {
              builder.string('logoDark', resource.logoDark)
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

            if (resource.privacyPolicyLink) {
              builder.string('privacyPolicyLink', resource.privacyPolicyLink)
            }

            if (resource.termsOfServiceLink) {
              builder.string('termsOfServiceLink', resource.termsOfServiceLink)
            }

            if (resource.supportLink) {
              builder.string('supportLink', resource.supportLink)
            }

            if (resource.footerText) {
              builder.string('footerText', resource.footerText)
            }

            if (resource.googleAnalyticsTag) {
              builder.string('googleAnalyticsTag', resource.googleAnalyticsTag)
            }

            // Indexing is on by default; only the opt-out is worth spelling out.
            if (resource.allowIndexing === false) {
              builder.boolean('allowIndexing', false)
            }

            const themes = resource.themeColors ? themeColorEntries(resource.themeColors) : []
            if (themes.length > 0) {
              builder.object('themeColors', builder => {
                for (const [theme, colors] of themes) {
                  builder.object(theme, builder => {
                    for (const [property, value] of colors) {
                      builder.string(property, value)
                    }
                  })
                }
              })
            }
          })
        })
      }))

      builder.export()
    }))
  }
}
