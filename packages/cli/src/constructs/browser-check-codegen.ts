import { Codegen, Context, validateScript } from './internal/codegen'
import { expr, ident } from '../sourcegen'
import { buildRuntimeCheckProps, RuntimeCheckResource } from './check-codegen'
import { PlaywrightConfigResource, valueForPlaywrightConfig } from './playwright-config-codegen'

export interface BrowserCheckResource extends RuntimeCheckResource {
  checkType: 'BROWSER'
  script: string
  scriptPath?: string
  sslCheckDomain?: string | null
  playwrightConfig?: PlaywrightConfigResource
}

const construct = 'BrowserCheck'

export class BrowserCheckCodegen extends Codegen<BrowserCheckResource> {
  describe (resource: BrowserCheckResource): string {
    return `Browser Check: ${resource.name}`
  }

  gencode (logicalId: string, resource: BrowserCheckResource, context: Context): void {
    const filePath = context.filePath('resources/browser-checks', resource.name, {
      tags: resource.tags,
      isolate: true,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.object('code', builder => {
            validateScript(resource.script)

            const snippetFiles = context.findScriptSnippetFiles(resource.script)
            for (const snippetFile of snippetFiles) {
              const localSnippetFile = this.program.generatedSupportFile(`${file.dirname}/snippets/${snippetFile.basename}`)
              localSnippetFile.plainImport(localSnippetFile.relativePath(snippetFile))
            }

            const scriptFile = this.program.staticSpecFile(filePath.extless, resource.script)
            builder.string('entrypoint', file.relativePath(scriptFile))
          })

          if (resource.sslCheckDomain !== undefined && resource.sslCheckDomain !== null && resource.sslCheckDomain !== '') {
            builder.string('sslCheckDomain', resource.sslCheckDomain)
          }

          if (resource.playwrightConfig) {
            builder.value('playwrightConfig', valueForPlaywrightConfig(resource.playwrightConfig))
          }

          buildRuntimeCheckProps(this.program, file, builder, resource, context)
        })
      })
    }))
  }
}
