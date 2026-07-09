import { Codegen, Context } from './internal/codegen/index.js'
import { expr, ident } from '../sourcegen/index.js'
import { buildMonitorProps, MonitorResource } from './monitor-codegen.js'
import { valueForSslRequest } from './ssl-request-codegen.js'
import { SslRequest } from './ssl-request.js'
import { SslAssertion } from './ssl-assertion.js'
import { IPFamily } from './ip.js'
import { SecurityBaseline, SslClientCertificateMode } from './ssl-request.js'

/**
 * Wire-format shape of the SSL request as returned by the Checkly API.
 * hostname/port/ipFamily live inside sslConfig on the wire; the construct
 * exposes them at different levels. degradedResponseTime/maxResponseTime
 * live at the resource top level, not inside sslConfig.
 */
export interface SslMonitorWireRequest {
  sslConfig: {
    hostname: string
    port?: number
    ipFamily?: IPFamily
    serverName?: string
    skipChainValidation?: boolean
    handshakeTimeoutMs?: number
    alertDaysBeforeExpiry?: number
    clientCertificateMode?: SslClientCertificateMode
    securityBaseline?: SecurityBaseline
  }
  sslClientCertificateId?: string
  assertions?: Array<SslAssertion>
}

export interface SslMonitorResource extends MonitorResource {
  checkType: 'SSL'
  request: SslMonitorWireRequest
  degradedResponseTime?: number
  maxResponseTime?: number
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

    // Map wire format to new construct shape
    const wireReq = resource.request
    const constructRequest: SslRequest = {
      hostname: wireReq.sslConfig.hostname,
      port: wireReq.sslConfig.port,
      ipFamily: wireReq.sslConfig.ipFamily,
      sslConfig: {
        serverName: wireReq.sslConfig.serverName,
        sslClientCertificateId: wireReq.sslClientCertificateId,
        skipChainValidation: wireReq.sslConfig.skipChainValidation,
        handshakeTimeout: wireReq.sslConfig.handshakeTimeoutMs,
        alertDaysBeforeExpiry: wireReq.sslConfig.alertDaysBeforeExpiry,
        clientCertificateMode: wireReq.sslConfig.clientCertificateMode,
        securityBaseline: wireReq.sslConfig.securityBaseline,
      },
      assertions: wireReq.assertions,
    }

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

          builder.value('request', valueForSslRequest(this.program, file, context, constructRequest))
        })
      })
    }))
  }
}
