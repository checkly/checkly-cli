import { Codegen } from './internal/codegen'
import { expr, ident, Program, Value } from '../sourcegen'
import { Assertion, Request } from './api-check'
import { buildCheckProps, CheckResource } from './check.codegen'
import { valueForNumericAssertion, valueForGeneralAssertion } from './internal/assertion.codegen'
import { valueForKeyValuePair } from './key-value-pair.codegen'

export interface ApiCheckResource extends CheckResource {
  checkType: 'API'
  request: Request
  localSetupScript?: string
  setupScriptPath?: string
  // TODO: setupScriptDependencies
  localTearDownScript?: string
  tearDownScriptPath?: string
  // TODO: tearDownScriptDependencies
  degradedResponseTime?: number
  maxResponseTime?: number
}

export function valueForAssertion (program: Program, assertion: Assertion): Value {
  program.import('AssertionBuilder', 'checkly/constructs')

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
  gencode (logicalId: string, resource: ApiCheckResource): void {
    this.program.import(construct, 'checkly/constructs')

    this.program.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.object('request', builder => {
            builder.string('url', resource.request.url)
            builder.string('method', resource.request.method)

            if (resource.request.ipFamily) {
              builder.string('ipFamily', resource.request.ipFamily)
            }

            if (resource.request.followRedirects !== undefined) {
              builder.boolean('followRedirects', resource.request.followRedirects)
            }

            if (resource.request.skipSSL !== undefined) {
              builder.boolean('skipSSL', resource.request.skipSSL)
            }

            if (resource.request.assertions) {
              const assertions = resource.request.assertions
              builder.array('assertions', builder => {
                for (const assertion of assertions) {
                  builder.value(valueForAssertion(this.program, assertion))
                }
              })
            }

            if (resource.request.body) {
              builder.string('body', resource.request.body)
            }

            if (resource.request.bodyType) {
              builder.string('bodyType', resource.request.bodyType)
            }

            if (resource.request.headers) {
              const headers = resource.request.headers
              builder.array('headers', builder => {
                for (const header of headers) {
                  builder.value(valueForKeyValuePair(header))
                }
              })
            }

            if (resource.request.queryParameters) {
              const queryParameters = resource.request.queryParameters
              builder.array('queryParameters', builder => {
                for (const param of queryParameters) {
                  builder.value(valueForKeyValuePair(param))
                }
              })
            }

            if (resource.request.basicAuth) {
              const basicAuth = resource.request.basicAuth
              builder.object('basicAuth', builder => {
                builder.string('username', basicAuth.username)
                builder.string('password', basicAuth.password)
              })
            }
          })

          if (resource.localSetupScript) {
            const content = resource.localSetupScript
            builder.object('setupScript', builder => {
              builder.string('content', content)
            })
          }

          if (resource.setupScriptPath) {
            const scriptPath = resource.setupScriptPath
            builder.object('setupScript', builder => {
            // @TODO needs work
              builder.string('entrypoint', scriptPath)
            })
          }

          if (resource.localTearDownScript) {
            const content = resource.localTearDownScript
            builder.object('tearDownScript', builder => {
              builder.string('content', content)
            })
          }

          if (resource.tearDownScriptPath) {
            const scriptPath = resource.tearDownScriptPath
            builder.object('tearDownScript', builder => {
            // @TODO needs work
              builder.string('entrypoint', scriptPath)
            })
          }

          if (resource.degradedResponseTime !== undefined) {
            builder.number('degradedResponseTime', resource.degradedResponseTime)
          }

          if (resource.maxResponseTime !== undefined) {
            builder.number('maxResponseTime', resource.maxResponseTime)
          }

          buildCheckProps(this.program, builder, resource)
        })
      })
    }))
  }
}
