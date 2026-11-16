import { Codegen, Context, validateScript } from './internal/codegen/index.js'
import { expr, ident } from '../sourcegen/index.js'
import { buildRuntimeCheckProps, RuntimeCheckResource } from './check-codegen.js'
import { PlaywrightConfigResource, valueForPlaywrightConfig } from './playwright-config-codegen.js'

/**
 * The spec file of a browser or multi-step check stored without a script:
 * empty but for a line saying why, so the file explains itself. A stored
 * empty script stays an empty file.
 */
export const MISSING_SCRIPT = '// This check had no script stored in Checkly.\n'

export interface BrowserCheckResource extends RuntimeCheckResource {
  checkType: 'BROWSER'
  // Null on a row stored without one; see `MISSING_SCRIPT`.
  script: string | null
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
            const script = resource.script ?? MISSING_SCRIPT

            validateScript(script)

            const snippetFiles = context.findScriptSnippetFiles(script)
            for (const snippetFile of snippetFiles) {
              const localSnippetFile = this.program.generatedSupportFile(`${file.dirname}/snippets/${snippetFile.basename}`)
              localSnippetFile.plainImport(localSnippetFile.relativePath(snippetFile))
            }

            const scriptFile = this.program.staticSpecFile(filePath.extless, script)
            builder.string('entrypoint', file.relativePath(scriptFile))
          })

          if (resource.sslCheckDomain !== undefined && resource.sslCheckDomain !== null && resource.sslCheckDomain !== '') {
            builder.string('sslCheckDomain', resource.sslCheckDomain)
          }

          if (resource.playwrightConfig) {
            builder.value('playwrightConfig', valueForPlaywrightConfig(resource.playwrightConfig))
          }

          buildRuntimeCheckProps(this.program, file, builder, resource, context, {
            includeAutomaticCheckRepair: true,
          })
        })
      })
    }))
  }
}
