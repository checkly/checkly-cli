import { Monitor, MonitorProps } from './monitor.js'
import { Session } from './session.js'
import { Diagnostics } from './diagnostics.js'
import { SslRequest } from './ssl-request.js'
import { InvalidPropertyValueDiagnostic, RequiredPropertyDiagnostic } from './construct-diagnostics.js'

export interface SslMonitorProps extends MonitorProps {
  /**
   * Determines the request that the monitor is going to run.
   *
   * Unlike most monitors, the response-time limits for an SSL monitor live
   * inside the request as `sslConfig.degradedResponseTimeMs` and
   * `sslConfig.maxResponseTimeMs`.
   */
  request: SslRequest
}

/**
 * Creates an SSL Monitor
 */
export class SslMonitor extends Monitor {
  request: SslRequest

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

    if (this.request.sslClientCertificateId === undefined && config?.clientCertificateMode === 'explicit') {
      diagnostics.add(new RequiredPropertyDiagnostic(
        'sslClientCertificateId',
        new Error(
          `A value for "sslClientCertificateId" is required when "clientCertificateMode" is "explicit".`,
        ),
      ))
    }

    if (
      config?.degradedResponseTimeMs !== undefined
      && config?.maxResponseTimeMs !== undefined
      && config.degradedResponseTimeMs > config.maxResponseTimeMs
    ) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'degradedResponseTimeMs',
        new Error(
          `The value of "degradedResponseTimeMs" must be less than or equal to "maxResponseTimeMs".`,
        ),
      ))
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'SSL',
      request: this.request,
    }
  }
}
