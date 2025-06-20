import { GeneratedFile, object, Program, Value } from '../sourcegen'
import { valueForHttpAssertion } from './http-assertion-codegen'
import { HttpRequest } from './http-request'
import { Context } from './internal/codegen'
import { valueForKeyValuePair } from './key-value-pair-codegen'

export function valueForHttpRequest (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  request: HttpRequest,
): Value {
  genfile.namedImport('HttpAssertionBuilder', 'checkly/constructs')

  return object(builder => {
    builder.string('url', request.url)
    builder.string('method', request.method)

    if (request.ipFamily) {
      builder.string('ipFamily', request.ipFamily)
    }

    if (request.followRedirects === false) {
      builder.boolean('followRedirects', request.followRedirects)
    }

    if (request.skipSSL === true) {
      builder.boolean('skipSSL', request.skipSSL)
    }

    if (request.body !== undefined && request.body !== '') {
      builder.string('body', request.body)
    }

    if (request.bodyType && request.bodyType !== 'NONE') {
      builder.string('bodyType', request.bodyType)
    }

    if (request.headers) {
      const headers = request.headers
      if (headers.length > 0) {
        builder.array('headers', builder => {
          for (const header of headers) {
            builder.value(valueForKeyValuePair(program, genfile, context, header))
          }
        })
      }
    }

    if (request.queryParameters) {
      const queryParameters = request.queryParameters
      if (queryParameters.length > 0) {
        builder.array('queryParameters', builder => {
          for (const param of queryParameters) {
            builder.value(valueForKeyValuePair(program, genfile, context, param))
          }
        })
      }
    }

    if (request.basicAuth) {
      const basicAuth = request.basicAuth
      if (basicAuth.username !== '' && basicAuth.password !== '') {
        builder.object('basicAuth', builder => {
          builder.string('username', basicAuth.username)
          builder.string('password', basicAuth.password)
        })
      }
    }

    if (request.assertions) {
      const assertions = request.assertions
      if (assertions.length > 0) {
        builder.array('assertions', builder => {
          for (const assertion of assertions) {
            builder.value(valueForHttpAssertion(genfile, assertion))
          }
        })
      }
    }
  })
}
