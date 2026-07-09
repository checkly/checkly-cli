import { GeneratedFile, object, Program, Value } from '../sourcegen/index.js'
import { valueForGrpcAssertion } from './grpc-assertion-codegen.js'
import { GrpcRequest } from './grpc-request.js'
import { Context } from './internal/codegen/index.js'

export function valueForGrpcRequest (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  request: GrpcRequest,
): Value {
  return object(builder => {
    builder.string('url', request.url)
    builder.number('port', request.port)

    if (request.ipFamily && request.ipFamily !== 'IPv4') {
      builder.string('ipFamily', request.ipFamily)
    }

    if (request.skipSSL) {
      builder.boolean('skipSSL', request.skipSSL)
    }

    if (request.timeout !== undefined) {
      builder.number('timeout', request.timeout)
    }

    const config = request.grpcConfig
    builder.object('grpcConfig', builder => {
      if (config.mode) {
        builder.string('mode', config.mode)
      }

      if (config.tls !== undefined) {
        builder.boolean('tls', config.tls)
      }

      if (config.storeResponseBody !== undefined) {
        builder.boolean('storeResponseBody', config.storeResponseBody)
      }

      if (config.serviceDefinition) {
        builder.string('serviceDefinition', config.serviceDefinition)
      }

      if (config.method) {
        builder.string('method', config.method)
      }

      if (config.protoContent) {
        builder.string('protoContent', config.protoContent)
      }

      if (config.message) {
        builder.string('message', config.message)
      }

      if (config.service) {
        builder.string('service', config.service)
      }

      if (config.metadata) {
        const metadata = config.metadata
        if (metadata.length > 0) {
          builder.array('metadata', builder => {
            for (const entry of metadata) {
              builder.object(builder => {
                builder.string('key', entry.key)
                builder.string('value', entry.value)
              })
            }
          })
        }
      }
    })

    if (request.assertions) {
      const assertions = request.assertions
      if (assertions.length > 0) {
        builder.array('assertions', builder => {
          for (const assertion of assertions) {
            builder.value(valueForGrpcAssertion(genfile, assertion))
          }
        })
      }
    }
  })
}
