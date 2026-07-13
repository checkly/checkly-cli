import { Monitor, MonitorProps } from './monitor.js'
import { Session } from './session.js'
import { Diagnostics } from './diagnostics.js'
import { SslRequest } from './ssl-request.js'
import { validateResponseTimes } from './internal/common-diagnostics.js'
import { validateSslAssertion } from './ssl-assertion-validation.js'
import { RequiredPropertyDiagnostic } from './construct-diagnostics.js'

export interface SslMonitorProps extends MonitorProps {
  /**
   * Determines the request that the monitor is going to run.
   */
  request: SslRequest

  /**
   * The handshake time in milliseconds above which the monitor is considered
   * degraded.
   *
   * @minimum 0
   * @maximum 30000
   * @defaultValue 3000
   */
  degradedResponseTime?: number

  /**
   * The handshake time in milliseconds above which the monitor is considered
   * failing. Must be greater than or equal to `degradedResponseTime`.
   *
   * @minimum 0
   * @maximum 30000
   * @defaultValue 10000
   */
  maxResponseTime?: number
}

/**
 * Creates an SSL Monitor
 */
export class SslMonitor extends Monitor {
  request: SslRequest
  degradedResponseTime?: number
  maxResponseTime?: number

  /**
   * Constructs the SSL Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/ssl-monitor/ Read more in the docs}
   */

  constructor (logicalId: string, props: SslMonitorProps) {
    super(logicalId, props)

    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `SslMonitor:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    const config = this.request.sslConfig

    if (config?.sslClientCertificateId === undefined && config?.clientCertificateMode === 'explicit') {
      diagnostics.add(new RequiredPropertyDiagnostic(
        'sslClientCertificateId',
        new Error(
          `A value for "sslClientCertificateId" is required when "clientCertificateMode" is "explicit".`,
        ),
      ))
    }

    await validateResponseTimes(diagnostics, this, {
      degradedResponseTime: 30_000,
      maxResponseTime: 30_000,
      // Backend default applied when maxResponseTime is omitted.
      defaultMaxResponseTime: 10_000,
    })

    for (const [index, assertion] of (this.request.assertions ?? []).entries()) {
      validateSslAssertion(diagnostics, assertion, index)
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'SSL',
      request: {
        sslConfig: {
          hostname: this.request.hostname,
          port: this.request.port,
          ipFamily: this.request.ipFamily,
          serverName: this.request.sslConfig.serverName,
          skipChainValidation: this.request.sslConfig.skipChainValidation,
          handshakeTimeoutMs: this.request.sslConfig.handshakeTimeout,
          alertDaysBeforeExpiry: this.request.sslConfig.alertDaysBeforeExpiry,
          clientCertificateMode: this.request.sslConfig.clientCertificateMode,
          securityBaseline: this.request.sslConfig.securityBaseline,
        },
        sslClientCertificateId: this.request.sslConfig.sslClientCertificateId,
        assertions: this.request.assertions,
      },
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
