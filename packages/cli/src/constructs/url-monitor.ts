import { Diagnostics } from './diagnostics'
import { validateResponseTimes } from './internal/common-diagnostics'
import { Monitor, MonitorProps } from './monitor'
import { Session } from './project'
import { UrlRequest } from './url-request'

/**
 * Configuration properties for UrlMonitor.
 * Extends MonitorProps with URL-specific settings.
 */
export interface UrlMonitorProps extends MonitorProps {
  /**
   * Determines the request that the monitor is going to run.
   * Defines the URL and validation rules for the HTTP check.
   */
  request: UrlRequest
  
  /**
   * The response time in milliseconds where the monitor should be considered degraded.
   * Used for performance monitoring and alerting on slow responses.
   * 
   * @defaultValue 3000
   * @minimum 0
   * @maximum 30000
   * @example
   * ```typescript
   * degradedResponseTime: 2000  // Alert when URL responds slower than 2 seconds
   * ```
   */
  degradedResponseTime?: number
  
  /**
   * The response time in milliseconds where the monitor should be considered failing.
   * The monitor fails if the response takes longer than this threshold.
   * 
   * @defaultValue 5000
   * @minimum 0
   * @maximum 30000
   * @example
   * ```typescript
   * maxResponseTime: 5000  // Fail monitor if URL takes longer than 5 seconds
   * ```
   */
  maxResponseTime?: number
}

/**
 * Creates a URL Monitor to check HTTP endpoint availability and response times.
 * 
 * URL monitors are simplified HTTP checks that verify if a URL is accessible and responding
 * within acceptable time limits. They only support GET requests and status code assertions.
 * For more advanced HTTP monitoring with custom methods, headers, and body assertions,
 * use ApiCheck instead.
 * 
 * @example
 * ```typescript
 * // Basic URL monitor
 * new UrlMonitor('homepage-monitor', {
 *   name: 'Homepage Monitor',
 *   frequency: Frequency.EVERY_5M,
 *   locations: ['us-east-1', 'eu-west-1'],
 *   request: {
 *     url: 'https://example.com',
 *     assertions: [
 *       UrlAssertionBuilder.statusCode().equals(200)
 *     ]
 *   }
 * })
 * 
 * // URL monitor with performance thresholds
 * new UrlMonitor('api-health', {
 *   name: 'API Health Check',
 *   frequency: Frequency.EVERY_1M,
 *   locations: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
 *   request: {
 *     url: 'https://api.example.com/health',
 *     followRedirects: false,
 *     assertions: [
 *       UrlAssertionBuilder.statusCode().equals(200)
 *     ]
 *   },
 *   degradedResponseTime: 1000,
 *   maxResponseTime: 3000,
 *   alertChannels: [emailAlert, slackAlert]
 * })
 * 
 * // URL monitor with SSL verification disabled (for internal/dev endpoints)
 * new UrlMonitor('internal-service', {
 *   name: 'Internal Service Check',
 *   frequency: Frequency.EVERY_10M,
 *   privateLocations: ['datacenter-1'],
 *   request: {
 *     url: 'https://internal.company.local:8443/status',
 *     skipSSL: true,
 *     assertions: [
 *       UrlAssertionBuilder.statusCode().lessThan(400)
 *     ]
 *   }
 * })
 * ```
 * 
 * @see {@link https://www.checklyhq.com/docs/cli/constructs-reference/#urlmonitor | UrlMonitor API Reference}
 * @see {@link https://www.checklyhq.com/docs/url-monitors/ | URL Monitors Documentation}
 */
export class UrlMonitor extends Monitor {
  readonly request: UrlRequest
  readonly degradedResponseTime?: number
  readonly maxResponseTime?: number

  /**
   * Constructs the URL Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#urlmonitor Read more in the docs}
   */

  constructor (logicalId: string, props: UrlMonitorProps) {
    super(logicalId, props)

    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `UrlMonitor:${this.logicalId}`
  }

  protected supportsOnlyOnNetworkErrorRetryStrategy (): boolean {
    return true
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    await validateResponseTimes(diagnostics, this, {
      degradedResponseTime: 30_000,
      maxResponseTime: 30_000,
    })
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'URL',
      request: {
        ...this.request,
        method: 'GET',
      },
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
