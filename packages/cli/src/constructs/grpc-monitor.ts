import { Monitor, MonitorProps } from './monitor.js'
import { IPFamily } from './ip.js'
import { Session } from './session.js'
import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder } from './internal/assertion.js'
import { Diagnostics } from './diagnostics.js'
import { validateResponseTimes } from './internal/common-diagnostics.js'

type GrpcAssertionSource =
  | 'RESPONSE_TIME'
  | 'GRPC_RESPONSE'
  | 'GRPC_METADATA'
  | 'GRPC_HEALTHCHECK_STATUS'
  | 'GRPC_STATUS_CODE'

export type GrpcAssertion = CoreAssertion<GrpcAssertionSource>

/**
 * Builder class for creating gRPC monitor assertions.
 * Provides methods to create assertions for gRPC responses, metadata, status
 * codes and health-check status.
 *
 * @example
 * ```typescript
 * // Response time assertions
 * GrpcAssertionBuilder.responseTime().lessThan(2000)
 *
 * // gRPC status code assertions (0 = OK)
 * GrpcAssertionBuilder.statusCode().equals(0)
 *
 * // Response body assertions (optionally on a JSON path of the response)
 * GrpcAssertionBuilder.response('$.message').contains('pong')
 *
 * // Metadata assertions (property = the metadata key)
 * GrpcAssertionBuilder.metadata('content-type').contains('application/grpc')
 *
 * // Health-check status assertions (HEALTH mode)
 * GrpcAssertionBuilder.healthcheckStatus().equals('SERVING')
 * ```
 */
export class GrpcAssertionBuilder {
  /**
   * Creates an assertion builder for gRPC response time.
   * @returns A numeric assertion builder for response time in milliseconds
   */
  static responseTime () {
    return new NumericAssertionBuilder<GrpcAssertionSource>('RESPONSE_TIME')
  }

  /**
   * Creates an assertion builder for the gRPC status code (0 = OK).
   * @returns A numeric assertion builder for the gRPC status code
   */
  static statusCode () {
    return new NumericAssertionBuilder<GrpcAssertionSource>('GRPC_STATUS_CODE')
  }

  /**
   * Creates an assertion builder for the gRPC response body.
   * @param property Optional property path into the response body
   * @returns A general assertion builder for the response content
   */
  static response (property?: string) {
    return new GeneralAssertionBuilder<GrpcAssertionSource>('GRPC_RESPONSE', property)
  }

  /**
   * Creates an assertion builder for gRPC response metadata.
   * @param property Optional metadata key to assert on
   * @returns A general assertion builder for response metadata
   */
  static metadata (property?: string) {
    return new GeneralAssertionBuilder<GrpcAssertionSource>('GRPC_METADATA', property)
  }

  /**
   * Creates an assertion builder for the gRPC health-check status (HEALTH mode).
   * @returns A general assertion builder for the health-check status
   */
  static healthcheckStatus (property?: string) {
    return new GeneralAssertionBuilder<GrpcAssertionSource>('GRPC_HEALTHCHECK_STATUS', property)
  }
}

/**
 * A single gRPC metadata key/value pair sent with the request.
 */
export interface GrpcMetadata {
  /**
   * The metadata key.
   */
  key: string

  /**
   * The metadata value.
   */
  value: string
}

/**
 * The gRPC-specific configuration nested inside a {@link GrpcRequest}.
 *
 * `mode` discriminates which sub-fields are allowed: `BEHAVIOR` (the default)
 * invokes a method and requires `method`; `HEALTH` performs a gRPC health check
 * and uses `service`. Fields scoped to the other mode are ignored by the API.
 */
export interface GrpcConfig {
  /**
   * The gRPC invocation mode.
   *
   * @defaultValue 'BEHAVIOR'
   */
  mode?: 'BEHAVIOR' | 'HEALTH'

  /**
   * Whether to use TLS for the connection.
   *
   * @defaultValue true
   */
  tls?: boolean

  /**
   * Metadata key/value pairs sent with the request.
   *
   * @defaultValue []
   */
  metadata?: Array<GrpcMetadata>

  /**
   * Whether to store the response body with the check result.
   *
   * @defaultValue true
   */
  storeResponseBody?: boolean

  /**
   * How the service definition is resolved. `REFLECTION` uses server
   * reflection; `PROTO_FILE` uses the supplied {@link protoContent}.
   *
   * BEHAVIOR mode only.
   *
   * @defaultValue 'REFLECTION'
   */
  serviceDefinition?: 'REFLECTION' | 'PROTO_FILE'

  /**
   * The fully-qualified method to invoke, e.g. `/grpc.health.v1.Health/Check`.
   *
   * Required in BEHAVIOR mode.
   */
  method?: string

  /**
   * The raw `.proto` content, required when
   * `serviceDefinition === 'PROTO_FILE'`.
   *
   * BEHAVIOR mode only.
   */
  protoContent?: string

  /**
   * The request message payload as a JSON string.
   *
   * BEHAVIOR mode only.
   *
   * @defaultValue ''
   */
  message?: string

  /**
   * The service name to health-check.
   *
   * HEALTH mode only.
   *
   * @defaultValue ''
   */
  service?: string
}

/**
 * Configuration for gRPC connection requests in gRPC checks.
 * Defines the connection parameters, gRPC config and validation rules.
 */
export interface GrpcRequest {
  /**
   * The host the connection should be made to.
   * Do not include a scheme or a port in the host.
   *
   * @example 'grpc.checklyhq.com'
   */
  url: string

  /**
   * The port the connection should be made to. Accepts a number or a
   * `{{template}}` string.
   *
   * @minimum 1
   * @maximum 65535
   * @example 50051
   */
  port: number | string

  /**
   * The IP family to use for the connection.
   *
   * @defaultValue 'IPv4'
   */
  ipFamily?: IPFamily

  /**
   * Whether to skip TLS certificate verification.
   *
   * @defaultValue false
   */
  skipSSL?: boolean

  /**
   * The connection timeout in seconds.
   *
   * @minimum 1
   * @maximum 180
   * @defaultValue 60
   */
  timeout?: number

  /**
   * The gRPC-specific configuration. Required by the public API.
   */
  grpcConfig: GrpcConfig

  /**
   * Assertions to validate the gRPC response.
   * Check the main Checkly documentation on gRPC assertions for specific values
   * that you can use in the "property" field.
   */
  assertions?: Array<GrpcAssertion>
}

export interface GrpcMonitorProps extends MonitorProps {
  /**
   * Determines the request that the check is going to run.
   */
  request: GrpcRequest

  /**
   * The response time in milliseconds where a check should be considered
   * degraded.
   *
   * @defaultValue 10000
   * @minimum 0
   * @maximum 180000
   * @example
   * ```typescript
   * degradedResponseTime: 5000  // Alert when the gRPC call takes longer than 5 seconds
   * ```
   */
  degradedResponseTime?: number

  /**
   * The response time in milliseconds where a check should be considered
   * failing.
   *
   * @defaultValue 20000
   * @minimum 0
   * @maximum 180000
   * @example
   * ```typescript
   * maxResponseTime: 30000  // Fail check if the gRPC call takes longer than 30 seconds
   * ```
   */
  maxResponseTime?: number
}

/**
 * Creates a gRPC Monitor
 */
export class GrpcMonitor extends Monitor {
  request: GrpcRequest
  degradedResponseTime?: number
  maxResponseTime?: number

  /**
   * Constructs the gRPC Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/grpc-monitor/ Read more in the docs}
   */

  constructor (logicalId: string, props: GrpcMonitorProps) {
    super(logicalId, props)

    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `GrpcMonitor:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    await validateResponseTimes(diagnostics, this, {
      degradedResponseTime: 180_000,
      maxResponseTime: 180_000,
    })
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'GRPC',
      request: this.request,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}

// Aliases for backwards compatibility.
export {
  GrpcMonitorProps as GrpcCheckProps,
  GrpcMonitor as GrpcCheck,
}
