import { expr, GeneratedFile, ident, ObjectValueBuilder, Value } from '../sourcegen/index.js'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen.js'
import { Codegen, Context } from './internal/codegen/index.js'
import { buildMonitorProps, MonitorResource } from './monitor-codegen.js'
import { SslAssertion, SslRequest, SslSecurityBaseline } from './ssl-monitor.js'

export interface SslMonitorResource extends MonitorResource {
  checkType: 'SSL'
  request: SslRequest
}

export function valueForSslAssertion (genfile: GeneratedFile, assertion: SslAssertion): Value {
  genfile.namedImport('SslAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'CERT_EXPIRES_IN_DAYS':
      return valueForNumericAssertion('SslAssertionBuilder', 'certExpiresInDays', assertion)
    case 'KEY_SIZE_BITS':
      return valueForNumericAssertion('SslAssertionBuilder', 'keySizeBits', assertion)
    case 'HANDSHAKE_TIME_MS':
      return valueForNumericAssertion('SslAssertionBuilder', 'handshakeTimeMs', assertion)
    case 'CERT_NOT_EXPIRED':
      return valueForGeneralAssertion('SslAssertionBuilder', 'certNotExpired', assertion)
    case 'HOSTNAME_VERIFIED':
      return valueForGeneralAssertion('SslAssertionBuilder', 'hostnameVerified', assertion)
    case 'CHAIN_TRUSTED':
      return valueForGeneralAssertion('SslAssertionBuilder', 'chainTrusted', assertion)
    case 'TLS_VERSION':
      return valueForGeneralAssertion('SslAssertionBuilder', 'tlsVersion', assertion)
    case 'CIPHER_SUITE':
      return valueForGeneralAssertion('SslAssertionBuilder', 'cipherSuite', assertion)
    case 'ISSUER_CN':
      return valueForGeneralAssertion('SslAssertionBuilder', 'issuerCn', assertion)
    case 'CERT_FINGERPRINT_SHA256':
      return valueForGeneralAssertion('SslAssertionBuilder', 'certFingerprintSha256', assertion)
    case 'ISSUER_FINGERPRINT_SHA256':
      return valueForGeneralAssertion('SslAssertionBuilder', 'issuerFingerprintSha256', assertion)
    case 'SIGNATURE_ALGORITHM':
      return valueForGeneralAssertion('SslAssertionBuilder', 'signatureAlgorithm', assertion)
    case 'OCSP_STAPLED':
      return valueForGeneralAssertion('SslAssertionBuilder', 'ocspStapled', assertion)
    case 'SAN_CONTAINS':
      return valueForGeneralAssertion('SslAssertionBuilder', 'sanContains', assertion)
    default:
      throw new Error(`Unsupported SSL assertion source ${assertion.source}`)
  }
}

function buildSecurityBaseline (builder: ObjectValueBuilder, baseline: SslSecurityBaseline): void {
  builder.object('securityBaseline', builder => {
    if (baseline.enabled !== undefined) {
      builder.boolean('enabled', baseline.enabled)
    }

    if (baseline.minTLSVersion) {
      const rule = baseline.minTLSVersion
      builder.object('minTLSVersion', builder => {
        if (rule.value) {
          builder.string('value', rule.value)
        }
        if (rule.severity) {
          builder.string('severity', rule.severity)
        }
      })
    }

    if (baseline.minKeySizeBits) {
      const rule = baseline.minKeySizeBits
      builder.object('minKeySizeBits', builder => {
        if (rule.value !== undefined) {
          builder.number('value', rule.value)
        }
        if (rule.severity) {
          builder.string('severity', rule.severity)
        }
      })
    }

    if (baseline.weakSignatureAlgorithm?.severity) {
      const severity = baseline.weakSignatureAlgorithm.severity
      builder.object('weakSignatureAlgorithm', builder => {
        builder.string('severity', severity)
      })
    }

    if (baseline.weakCipherSuite?.severity) {
      const severity = baseline.weakCipherSuite.severity
      builder.object('weakCipherSuite', builder => {
        builder.string('severity', severity)
      })
    }

    if (baseline.knownBadCA?.severity) {
      const severity = baseline.knownBadCA.severity
      builder.object('knownBadCA', builder => {
        builder.string('severity', severity)
      })
    }

    if (baseline.recommendedTLSVersion) {
      const rule = baseline.recommendedTLSVersion
      builder.object('recommendedTLSVersion', builder => {
        if (rule.value) {
          builder.string('value', rule.value)
        }
        if (rule.severity) {
          builder.string('severity', rule.severity)
        }
      })
    }

    if (baseline.recommendedKeySizeBits) {
      const rule = baseline.recommendedKeySizeBits
      builder.object('recommendedKeySizeBits', builder => {
        if (rule.value !== undefined) {
          builder.number('value', rule.value)
        }
        if (rule.severity) {
          builder.string('severity', rule.severity)
        }
      })
    }

    if (baseline.ocspMustStapleRespected?.severity) {
      const severity = baseline.ocspMustStapleRespected.severity
      builder.object('ocspMustStapleRespected', builder => {
        builder.string('severity', severity)
      })
    }

    if (baseline.sctPresent?.severity) {
      const severity = baseline.sctPresent.severity
      builder.object('sctPresent', builder => {
        builder.string('severity', severity)
      })
    }
  })
}

const construct = 'SslMonitor'

export class SslMonitorCodegen extends Codegen<SslMonitorResource> {
  describe (resource: SslMonitorResource): string {
    return `SSL Monitor: ${resource.name}`
  }

  gencode (logicalId: string, resource: SslMonitorResource, context: Context): void {
    const filePath = context.filePath('resources/ssl-monitors', resource.name, {
      tags: resource.tags,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          buildMonitorProps(this.program, file, builder, resource, context)

          builder.object('request', builder => {
            const sslConfig = resource.request.sslConfig
            builder.object('sslConfig', builder => {
              builder.string('hostname', sslConfig.hostname)

              if (sslConfig.port !== undefined) {
                builder.number('port', sslConfig.port)
              }

              if (sslConfig.serverName !== undefined && sslConfig.serverName !== null) {
                builder.string('serverName', sslConfig.serverName)
              }

              if (sslConfig.ipFamily) {
                builder.string('ipFamily', sslConfig.ipFamily)
              }

              if (sslConfig.skipChainValidation !== undefined) {
                builder.boolean('skipChainValidation', sslConfig.skipChainValidation)
              }

              if (sslConfig.handshakeTimeoutMs !== undefined) {
                builder.number('handshakeTimeoutMs', sslConfig.handshakeTimeoutMs)
              }

              if (sslConfig.alertDaysBeforeExpiry !== undefined) {
                builder.number('alertDaysBeforeExpiry', sslConfig.alertDaysBeforeExpiry)
              }

              if (sslConfig.clientCertificateMode) {
                builder.string('clientCertificateMode', sslConfig.clientCertificateMode)
              }

              if (sslConfig.degradedResponseTimeMs !== undefined) {
                builder.number('degradedResponseTimeMs', sslConfig.degradedResponseTimeMs)
              }

              if (sslConfig.maxResponseTimeMs !== undefined) {
                builder.number('maxResponseTimeMs', sslConfig.maxResponseTimeMs)
              }

              if (sslConfig.securityBaseline) {
                buildSecurityBaseline(builder, sslConfig.securityBaseline)
              }
            })

            const sslClientCertificateId = resource.request.sslClientCertificateId
            if (sslClientCertificateId !== undefined && sslClientCertificateId !== null) {
              builder.string('sslClientCertificateId', sslClientCertificateId)
            }

            if (resource.request.assertions) {
              const assertions = resource.request.assertions
              if (assertions.length > 0) {
                builder.array('assertions', builder => {
                  for (const assertion of assertions) {
                    builder.value(valueForSslAssertion(file, assertion))
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
