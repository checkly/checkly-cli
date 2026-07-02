import { GeneratedFile, object, Program, unknown, Value } from '../sourcegen/index.js'
import { valueForSslAssertion } from './ssl-assertion-codegen.js'
import { SslRequest } from './ssl-request.js'
import { Context } from './internal/codegen/index.js'

export function valueForSslRequest (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  request: SslRequest,
): Value {
  return object(builder => {
    builder.string('hostname', request.hostname)

    if (request.port !== undefined && request.port !== 443) {
      builder.number('port', request.port)
    }

    if (request.ipFamily && request.ipFamily !== 'IPv4') {
      builder.string('ipFamily', request.ipFamily)
    }

    const config = request.sslConfig
    builder.object('sslConfig', builder => {
      if (config.serverName) {
        builder.string('serverName', config.serverName)
      }

      if (config.sslClientCertificateId) {
        builder.string('sslClientCertificateId', config.sslClientCertificateId)
      }

      if (config.skipChainValidation) {
        builder.boolean('skipChainValidation', config.skipChainValidation)
      }

      if (config.handshakeTimeoutMs !== undefined) {
        builder.number('handshakeTimeoutMs', config.handshakeTimeoutMs)
      }

      if (config.alertDaysBeforeExpiry !== undefined) {
        builder.number('alertDaysBeforeExpiry', config.alertDaysBeforeExpiry)
      }

      if (config.clientCertificateMode) {
        builder.string('clientCertificateMode', config.clientCertificateMode)
      }

      if (config.securityBaseline) {
        builder.value('securityBaseline', unknown(config.securityBaseline))
      }
    })

    if (request.assertions) {
      const assertions = request.assertions
      if (assertions.length > 0) {
        builder.array('assertions', builder => {
          for (const assertion of assertions) {
            builder.value(valueForSslAssertion(genfile, assertion))
          }
        })
      }
    }
  })
}
