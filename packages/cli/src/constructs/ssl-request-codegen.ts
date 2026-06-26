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
    const config = request.sslConfig
    builder.object('sslConfig', builder => {
      builder.string('hostname', config.hostname)

      if (config.port !== undefined && config.port !== 443) {
        builder.number('port', config.port)
      }

      if (config.serverName) {
        builder.string('serverName', config.serverName)
      }

      if (config.ipFamily && config.ipFamily !== 'IPv4') {
        builder.string('ipFamily', config.ipFamily)
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

      if (config.degradedResponseTimeMs !== undefined) {
        builder.number('degradedResponseTimeMs', config.degradedResponseTimeMs)
      }

      if (config.maxResponseTimeMs !== undefined) {
        builder.number('maxResponseTimeMs', config.maxResponseTimeMs)
      }

      if (config.securityBaseline) {
        builder.value('securityBaseline', unknown(config.securityBaseline))
      }
    })

    if (request.sslClientCertificateId) {
      builder.string('sslClientCertificateId', request.sslClientCertificateId)
    }

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
