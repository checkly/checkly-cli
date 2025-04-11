import { Codegen, Context } from './internal/codegen'
import { expr, GeneratedFile, ident, Value } from '../sourcegen'
import { Assertion, Request } from './api-check'
import { buildCheckProps, CheckResource } from './check-codegen'
import { valueForNumericAssertion, valueForGeneralAssertion } from './internal/assertion-codegen'
import { valueForKeyValuePair } from './key-value-pair-codegen'

export interface SnippetResource {
  id: number
  name: string
  script?: string
}

export interface ApiCheckResource extends CheckResource {
  checkType: 'API'
  request: Request
  localSetupScript?: string
  setupScriptPath?: string
  setupScript?: SnippetResource
  localTearDownScript?: string
  tearDownScriptPath?: string
  tearDownScript?: SnippetResource
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
    const { filename, stub } = context.filename(resource.name, resource.tags)
    const file = this.program.generatedConstructFile(`resources/api-checks/${stub}/${filename}`)

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
            builder.object('setupScript', builder => {
              const scriptFile = this.program.staticSupportFile(`${file.dirname}/setup-script`, content)
              builder.string('entrypoint', file.relativePath(scriptFile))
            })
          } else if (resource.setupScript) {
            const snippet = resource.setupScript
            if (snippet.script !== undefined) {
              const script = snippet.script
              const { filename } = context.filename(snippet.name)
              const snippetFile = this.program.staticSupportFile(`snippets/${filename}`, script)
              const scriptFile = this.program.generatedSupportFile(`${file.dirname}/setup-script`)
              scriptFile.plainImport(scriptFile.relativePath(snippetFile))
              builder.object('setupScript', builder => {
                builder.string('entrypoint', file.relativePath(scriptFile))
              })
            }
          }

          if (resource.localTearDownScript) {
            const content = resource.localTearDownScript
            builder.object('tearDownScript', builder => {
              const scriptFile = this.program.staticSupportFile(`${file.dirname}/teardown-script`, content)
              builder.string('entrypoint', file.relativePath(scriptFile))
            })
          } else if (resource.tearDownScript) {
            const snippet = resource.tearDownScript
            if (snippet.script !== undefined) {
              const script = snippet.script
              const { filename } = context.filename(snippet.name)
              const snippetFile = this.program.staticSupportFile(`snippets/${filename}`, script)
              const scriptFile = this.program.generatedSupportFile(`${file.dirname}/teardown-script`)
              scriptFile.plainImport(scriptFile.relativePath(snippetFile))
              builder.object('tearDownScript', builder => {
                builder.string('entrypoint', file.relativePath(scriptFile))
              })
            }
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
