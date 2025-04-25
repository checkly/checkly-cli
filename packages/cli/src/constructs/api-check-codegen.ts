import { Codegen, Context, validateScript } from './internal/codegen'
import { expr, GeneratedFile, ident, Value } from '../sourcegen'
import { Assertion, Request } from './api-check'
import { buildCheckProps, CheckResource } from './check-codegen'
import { valueForNumericAssertion, valueForGeneralAssertion } from './internal/assertion-codegen'
import { valueForKeyValuePair } from './key-value-pair-codegen'

export interface ApiCheckResource extends CheckResource {
  checkType: 'API'
  request: Request
  localSetupScript?: string
  setupScriptPath?: string
  setupSnippetId?: number | null
  localTearDownScript?: string
  tearDownScriptPath?: string
  tearDownSnippetId?: number | null
  degradedResponseTime?: number
  maxResponseTime?: number
}

export function valueForAssertion (genfile: GeneratedFile, assertion: Assertion): Value {
  genfile.namedImport('AssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'STATUS_CODE':
      return valueForNumericAssertion('AssertionBuilder', 'statusCode', assertion)
    case 'JSON_BODY':
      return valueForGeneralAssertion('AssertionBuilder', 'jsonBody', assertion)
    case 'HEADERS':
      return valueForGeneralAssertion('AssertionBuilder', 'headers', assertion)
    case 'TEXT_BODY':
      return valueForGeneralAssertion('AssertionBuilder', 'textBody', assertion)
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('AssertionBuilder', 'responseTime', assertion)
    default:
      throw new Error(`Unsupported assertion source ${assertion.source}`)
  }
}

const construct = 'ApiCheck'

export class ApiCheckCodegen extends Codegen<ApiCheckResource> {
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
          builder.object('request', builder => {
            builder.string('url', resource.request.url)
            builder.string('method', resource.request.method)

            if (resource.request.ipFamily) {
              builder.string('ipFamily', resource.request.ipFamily)
            }

            if (resource.request.followRedirects === false) {
              builder.boolean('followRedirects', resource.request.followRedirects)
            }

            if (resource.request.skipSSL === true) {
              builder.boolean('skipSSL', resource.request.skipSSL)
            }

            if (resource.request.body !== undefined && resource.request.body !== '') {
              builder.string('body', resource.request.body)
            }

            if (resource.request.bodyType && resource.request.bodyType !== 'NONE') {
              builder.string('bodyType', resource.request.bodyType)
            }

            if (resource.request.headers) {
              const headers = resource.request.headers
              if (headers.length > 0) {
                builder.array('headers', builder => {
                  for (const header of headers) {
                    builder.value(valueForKeyValuePair(this.program, file, context, header))
                  }
                })
              }
            }

            if (resource.request.queryParameters) {
              const queryParameters = resource.request.queryParameters
              if (queryParameters.length > 0) {
                builder.array('queryParameters', builder => {
                  for (const param of queryParameters) {
                    builder.value(valueForKeyValuePair(this.program, file, context, param))
                  }
                })
              }
            }

            if (resource.request.basicAuth) {
              const basicAuth = resource.request.basicAuth
              if (basicAuth.username !== '' && basicAuth.password !== '') {
                builder.object('basicAuth', builder => {
                  builder.string('username', basicAuth.username)
                  builder.string('password', basicAuth.password)
                })
              }
            }

            if (resource.request.assertions) {
              const assertions = resource.request.assertions
              if (assertions.length > 0) {
                builder.array('assertions', builder => {
                  for (const assertion of assertions) {
                    builder.value(valueForAssertion(file, assertion))
                  }
                })
              }
            }
          })

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
