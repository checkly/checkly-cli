import { expr, GeneratedFile, ident, Value } from '../sourcegen/index.js'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen.js'
import { Codegen, Context } from './internal/codegen/index.js'
import { buildMonitorProps, MonitorResource } from './monitor-codegen.js'
import { GrpcAssertion, GrpcRequest } from './grpc-monitor.js'

export interface GrpcMonitorResource extends MonitorResource {
  checkType: 'GRPC'
  request: GrpcRequest
  degradedResponseTime?: number
  maxResponseTime?: number
}

export function valueForGrpcAssertion (genfile: GeneratedFile, assertion: GrpcAssertion): Value {
  genfile.namedImport('GrpcAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('GrpcAssertionBuilder', 'responseTime', assertion)
    case 'GRPC_STATUS_CODE':
      return valueForNumericAssertion('GrpcAssertionBuilder', 'statusCode', assertion)
    case 'GRPC_RESPONSE':
      return valueForGeneralAssertion('GrpcAssertionBuilder', 'response', assertion)
    case 'GRPC_METADATA':
      return valueForGeneralAssertion('GrpcAssertionBuilder', 'metadata', assertion)
    case 'GRPC_HEALTHCHECK_STATUS':
      return valueForGeneralAssertion('GrpcAssertionBuilder', 'healthcheckStatus', assertion)
    default:
      throw new Error(`Unsupported gRPC assertion source ${assertion.source}`)
  }
}

const construct = 'GrpcMonitor'

export class GrpcMonitorCodegen extends Codegen<GrpcMonitorResource> {
  describe (resource: GrpcMonitorResource): string {
    return `gRPC Monitor: ${resource.name}`
  }

  gencode (logicalId: string, resource: GrpcMonitorResource, context: Context): void {
    const filePath = context.filePath('resources/grpc-monitors', resource.name, {
      tags: resource.tags,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          if (resource.degradedResponseTime !== undefined) {
            builder.number('degradedResponseTime', resource.degradedResponseTime)
          }

          if (resource.maxResponseTime !== undefined) {
            builder.number('maxResponseTime', resource.maxResponseTime)
          }

          buildMonitorProps(this.program, file, builder, resource, context)

          builder.object('request', builder => {
            builder.string('url', resource.request.url)

            if (typeof resource.request.port === 'number') {
              builder.number('port', resource.request.port)
            } else {
              builder.string('port', resource.request.port)
            }

            if (resource.request.ipFamily) {
              builder.string('ipFamily', resource.request.ipFamily)
            }

            if (resource.request.skipSSL !== undefined) {
              builder.boolean('skipSSL', resource.request.skipSSL)
            }

            if (resource.request.timeout !== undefined) {
              builder.number('timeout', resource.request.timeout)
            }

            const grpcConfig = resource.request.grpcConfig
            builder.object('grpcConfig', builder => {
              if (grpcConfig.mode) {
                builder.string('mode', grpcConfig.mode)
              }

              if (grpcConfig.tls !== undefined) {
                builder.boolean('tls', grpcConfig.tls)
              }

              if (grpcConfig.storeResponseBody !== undefined) {
                builder.boolean('storeResponseBody', grpcConfig.storeResponseBody)
              }

              if (grpcConfig.serviceDefinition) {
                builder.string('serviceDefinition', grpcConfig.serviceDefinition)
              }

              if (grpcConfig.method) {
                builder.string('method', grpcConfig.method)
              }

              if (grpcConfig.protoContent) {
                builder.string('protoContent', grpcConfig.protoContent)
              }

              if (grpcConfig.message) {
                builder.string('message', grpcConfig.message)
              }

              if (grpcConfig.service) {
                builder.string('service', grpcConfig.service)
              }

              if (grpcConfig.metadata && grpcConfig.metadata.length > 0) {
                const metadata = grpcConfig.metadata
                builder.array('metadata', builder => {
                  for (const entry of metadata) {
                    builder.object(builder => {
                      builder.string('key', entry.key)
                      builder.string('value', entry.value)
                    })
                  }
                })
              }
            })

            if (resource.request.assertions) {
              const assertions = resource.request.assertions
              if (assertions.length > 0) {
                builder.array('assertions', builder => {
                  for (const assertion of assertions) {
                    builder.value(valueForGrpcAssertion(file, assertion))
                  }
                })
              }
            }
          })
        })
      })
    }))
  }
}
