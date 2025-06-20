import { Codegen, Context, validateScript } from './internal/codegen'
import { expr, ident } from '../sourcegen'
import { buildCheckProps, CheckResource } from './check-codegen'
import { HttpRequest } from './http-request'
import { valueForHttpRequest } from './http-request-codegen'

export interface ApiCheckResource extends CheckResource {
  checkType: 'API'
  request: HttpRequest
  localSetupScript?: string
  setupScriptPath?: string
  setupSnippetId?: number | null
  localTearDownScript?: string
  tearDownScriptPath?: string
  tearDownSnippetId?: number | null
  degradedResponseTime?: number
  maxResponseTime?: number
}

const construct = 'ApiCheck'

export class ApiCheckCodegen extends Codegen<ApiCheckResource> {
  describe (resource: ApiCheckResource): string {
    return `API Check: ${resource.name}`
  }

  gencode (logicalId: string, resource: ApiCheckResource, context: Context): void {
    const filePath = context.filePath('resources/api-checks', resource.name, {
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
          builder.value('request', valueForHttpRequest(this.program, file, context, resource.request))

          if (resource.localSetupScript) {
            const content = resource.localSetupScript
            validateScript(content)

            const snippetFiles = context.findScriptSnippetFiles(content)
            for (const snippetFile of snippetFiles) {
              const localSnippetFile = this.program.generatedSupportFile(`${file.dirname}/snippets/${snippetFile.basename}`)
              localSnippetFile.plainImport(localSnippetFile.relativePath(snippetFile))
            }

            builder.object('setupScript', builder => {
              const scriptFile = this.program.staticSupportFile(`${file.dirname}/setup-script`, content)
              builder.string('entrypoint', file.relativePath(scriptFile))
            })
          } else if (resource.setupSnippetId) {
            const snippetFile = context.lookupAuxiliarySnippetFile(resource.setupSnippetId)
            if (!snippetFile) {
              throw new Error(`Setup script refers to snippet #${resource.setupSnippetId} which is missing`)
            }

            const scriptFile = this.program.generatedSupportFile(`${file.dirname}/setup-script`)
            scriptFile.plainImport(scriptFile.relativePath(snippetFile))

            builder.object('setupScript', builder => {
              builder.string('entrypoint', file.relativePath(scriptFile))
            })
          }

          if (resource.localTearDownScript) {
            const content = resource.localTearDownScript
            validateScript(content)

            const snippetFiles = context.findScriptSnippetFiles(content)
            for (const snippetFile of snippetFiles) {
              const aliasFile = this.program.generatedSupportFile(`${file.dirname}/snippets/${snippetFile.basename}`)
              aliasFile.plainImport(aliasFile.relativePath(snippetFile))
            }

            builder.object('tearDownScript', builder => {
              const scriptFile = this.program.staticSupportFile(`${file.dirname}/teardown-script`, content)
              builder.string('entrypoint', file.relativePath(scriptFile))
            })
          } else if (resource.tearDownSnippetId) {
            const snippetFile = context.lookupAuxiliarySnippetFile(resource.tearDownSnippetId)
            if (!snippetFile) {
              throw new Error(`Teardown script refers to snippet #${resource.tearDownSnippetId} which is missing`)
            }

            const scriptFile = this.program.generatedSupportFile(`${file.dirname}/teardown-script`)
            scriptFile.plainImport(scriptFile.relativePath(snippetFile))

            builder.object('tearDownScript', builder => {
              builder.string('entrypoint', file.relativePath(scriptFile))
            })
          }

          if (resource.degradedResponseTime !== undefined) {
            builder.number('degradedResponseTime', resource.degradedResponseTime)
          }

          if (resource.maxResponseTime !== undefined) {
            builder.number('maxResponseTime', resource.maxResponseTime)
          }

          buildCheckProps(this.program, file, builder, resource, context)
        })
      })
    }))
  }
}
