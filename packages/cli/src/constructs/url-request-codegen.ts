import { GeneratedFile, object, Program, Value } from '../sourcegen/index.js'
import { valueForUrlAssertion } from './url-assertion-codegen.js'
import { UrlRequest } from './url-request.js'
import { Context } from './internal/codegen/index.js'

export function valueForUrlRequest (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  request: UrlRequest,
): Value {
  return object(builder => {
    builder.string('url', request.url)

    if (request.ipFamily) {
      builder.string('ipFamily', request.ipFamily)
    }

    if (request.followRedirects === false) {
      builder.boolean('followRedirects', request.followRedirects)
    }

    if (request.skipSSL === true) {
      builder.boolean('skipSSL', request.skipSSL)
    }

    if (request.assertions) {
      const assertions = request.assertions
      if (assertions.length > 0) {
        builder.array('assertions', builder => {
          for (const assertion of assertions) {
            builder.value(valueForUrlAssertion(genfile, assertion))
          }
        })
      }
    }
  })
}
