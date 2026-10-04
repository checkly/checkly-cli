import { GeneratedFile, object, Program, Value } from '../sourcegen/index.js'
import { valueForAssertion } from './api-assertion-codegen.js'
import { Request } from './api-request.js'
import { Context } from './internal/codegen/index.js'
import { valueForKeyValuePair } from './key-value-pair-codegen.js'

export function valueForRequest (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  request: Request,
): Value {
  return object(builder => {
    builder.string('url', request.url)
    builder.string('method', request.method)

    if (request.ipFamily && (request.ipFamily !== 'IPv4' || context.spelledOut('request.ipFamily'))) {
      builder.string('ipFamily', request.ipFamily)
    }

    if (request.followRedirects != null
      && (request.followRedirects === false || context.spelledOut('request.followRedirects'))) {
      builder.boolean('followRedirects', request.followRedirects)
    }

    if (request.skipSSL != null && (request.skipSSL === true || context.spelledOut('request.skipSSL'))) {
      builder.boolean('skipSSL', request.skipSSL)
    }

    if (request.body !== undefined && (request.body !== '' || context.spelledOut('request.body'))) {
      builder.string('body', request.body)
    }

    if (request.bodyType && (request.bodyType !== 'NONE' || context.spelledOut('request.bodyType'))) {
      builder.string('bodyType', request.bodyType)
    }

    if (request.headers) {
      const headers = request.headers
      if (headers.length > 0) {
        builder.array('headers', builder => {
          for (const header of headers) {
            builder.value(valueForKeyValuePair(program, genfile, context, header, 'request.headers'))
          }
        })
      }
    }

    if (request.queryParameters) {
      const queryParameters = request.queryParameters
      if (queryParameters.length > 0) {
        builder.array('queryParameters', builder => {
          for (const param of queryParameters) {
            builder.value(valueForKeyValuePair(program, genfile, context, param, 'request.queryParameters'))
          }
        })
      }
    }

    if (request.basicAuth) {
      const basicAuth = request.basicAuth
      // Either field alone is a credential the construct must keep.
      if (basicAuth.username !== '' || basicAuth.password !== '' || context.spelledOut('request.basicAuth')) {
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
            builder.value(valueForAssertion(genfile, assertion))
          }
        })
      }
    }
  })
}
