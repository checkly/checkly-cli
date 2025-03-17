import { Check, CheckProps } from './check'
import { IPFamily } from './api-check'
import { Session } from './project'
import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder, sourceForNumericAssertion, sourceForGeneralAssertion } from './internal/assertion'
import { expr, ident, Program, Value } from '../sourcegen'

type TcpAssertionSource = 'RESPONSE_DATA' | 'RESPONSE_TIME'

export type TcpAssertion = CoreAssertion<TcpAssertionSource>

export class TcpAssertionBuilder {
  static responseData (property?: string) {
    return new GeneralAssertionBuilder<TcpAssertionSource>('RESPONSE_DATA', property)
  }

  static responseTime () {
    return new NumericAssertionBuilder<TcpAssertionSource>('RESPONSE_TIME')
  }
}

export interface TcpRequest {
  /**
   * The hostname the connection should be made to.
   *
   * Do not include a scheme or a port in the hostname.
   */
  hostname: string
  /**
   * The port the connection should be made to.
   */
  port: number
  /**
   * Check the main Checkly documentation on TCP assertions for specific values
   * that you can use in the "property" field.
   */
  assertions?: Array<TcpAssertion>
  /**
   * The IP family to use for the connection.
   *
   * @default "IPv4"
   */
  ipFamily?: IPFamily
  /**
   * The data to send to the target host.
   */
  data?: string
}

export interface TcpCheckProps extends CheckProps {
  /**
   * Determines the request that the check is going to run.
   */
  request: TcpRequest
  /**
   * The response time in milliseconds where a check should be considered degraded.
   */
  degradedResponseTime?: number
  /**
   * The response time in milliseconds where a check should be considered failing.
   */
  maxResponseTime?: number
}

/**
 * Creates an TCP Check
 *
 * @remarks
 *
 * This class make use of the TCP Checks endpoints.
 */
export class TcpCheck extends Check {
  request: TcpRequest
  degradedResponseTime?: number
  maxResponseTime?: number

  /**
   * Constructs the TCP Check instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#tcpcheck Read more in the docs}
   */

  constructor (logicalId: string, props: TcpCheckProps) {
    super(logicalId, props)

    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'TCP',
      request: this.request,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }

  source (program: Program): void {
    program.import('TcpCheck', 'checkly/constructs')

    program.value(expr(ident('TcpCheck'), builder => {
      builder.new(builder => {
        builder.string(this.logicalId)
        builder.object(builder => {
          this.buildSourceForCheckProps(program, builder)

          builder.object('request', builder => {
            builder.string('hostname', this.request.hostname)
            builder.number('port', this.request.port)

            if (this.request.ipFamily) {
              builder.string('ipFamily', this.request.ipFamily)
            }

            if (this.request.assertions) {
              const assertions = this.request.assertions
              builder.array('assertions', builder => {
                for (const assertion of assertions) {
                  builder.value(sourceForTcpAssertion(program, assertion))
                }
              })
            }

            if (this.request.data) {
              builder.string('data', this.request.data)
            }
          })

          if (this.degradedResponseTime !== undefined) {
            builder.number('degradedResponseTime', this.degradedResponseTime)
          }

          if (this.maxResponseTime !== undefined) {
            builder.number('maxResponseTime', this.maxResponseTime)
          }

          this.buildSourceForCheckProps(program, builder)
        })
      })
    }))
  }
}

function sourceForTcpAssertion (program: Program, assertion: TcpAssertion): Value {
  program.import('TcpAssertionBuilder', 'checkly/constructs')

  switch (assertion.source as TcpAssertionSource) {
    case 'RESPONSE_DATA':
      return sourceForGeneralAssertion('TcpAssertionBuilder', 'responseData', assertion)
    case 'RESPONSE_TIME':
      return sourceForNumericAssertion('TcpAssertionBuilder', 'responseTime', assertion)
    default:
      throw new Error(`Unsupported TCP assertion source ${assertion.source}`)
  }
}
