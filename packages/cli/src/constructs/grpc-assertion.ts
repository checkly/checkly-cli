import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder, toAssertion } from './internal/assertion.js'

type GrpcAssertionSource =
  | 'RESPONSE_TIME'
  | 'GRPC_STATUS_CODE'
  | 'GRPC_HEALTHCHECK_STATUS'
  | 'GRPC_RESPONSE'
  | 'TEXT_BODY'
  | 'GRPC_METADATA'

export type GrpcAssertion = CoreAssertion<GrpcAssertionSource>

/**
 * Health-check serving-status labels for use with
 * {@link GrpcAssertionBuilder.healthCheckStatus}. These are the labels of the
 * `grpc.health.v1.HealthCheckResponse.ServingStatus` enum.
 *
 * @example
 * ```typescript
 * GrpcAssertionBuilder.healthCheckStatus().equals('SERVING')
 * ```
 */
export type GrpcHealthStatus = 'UNKNOWN' | 'SERVING' | 'NOT_SERVING' | 'SERVICE_UNKNOWN'

/**
 * Maps each {@link GrpcHealthStatus} label to the numeric wire target the gRPC
 * runner evaluates health-check status against (it parses `target` with `Atoi`).
 * These are the `grpc.health.v1.HealthCheckResponse.ServingStatus` enum values:
 * 0 = UNKNOWN, 1 = SERVING, 2 = NOT_SERVING, 3 = SERVICE_UNKNOWN.
 *
 * This is the single source of truth for the label↔number mapping — the codegen
 * reverse-maps through it rather than duplicating the literals.
 */
export const grpcHealthStatusTargetByLabel: Record<GrpcHealthStatus, string> = {
  UNKNOWN: '0',
  SERVING: '1',
  NOT_SERVING: '2',
  SERVICE_UNKNOWN: '3',
}

// A health-check status target: either a friendly label or, for power users, the
// raw numeric enum value the wire actually carries.
type GrpcHealthStatusTarget = GrpcHealthStatus | 0 | 1 | 2 | 3

function grpcHealthStatusWireTarget (target: GrpcHealthStatusTarget): string {
  // Types keep TS callers to a known label or number, but a JS caller can bypass
  // them with an invalid string (e.g. lowercase 'serving'). Falling back to the
  // raw value — mirroring the webapp's `?? assertion.target` — preserves it so it
  // still surfaces (rather than as an empty string) in the validation diagnostic.
  return typeof target === 'number' ? target.toString() : grpcHealthStatusTargetByLabel[target] ?? String(target)
}

/**
 * Assertion builder for the gRPC health-check serving status. The runner evaluates
 * the status numerically, so `.equals()`/`.notEquals()` accept a friendly label
 * (or the raw enum number) and emit the numeric wire target. Only EQUALS and
 * NOT_EQUALS are supported — the runner rejects other comparisons for this source.
 */
class HealthCheckStatusAssertionBuilder {
  equals (target: GrpcHealthStatusTarget): GrpcAssertion {
    return toAssertion('GRPC_HEALTHCHECK_STATUS', 'EQUALS', grpcHealthStatusWireTarget(target))
  }

  notEquals (target: GrpcHealthStatusTarget): GrpcAssertion {
    return toAssertion('GRPC_HEALTHCHECK_STATUS', 'NOT_EQUALS', grpcHealthStatusWireTarget(target))
  }
}

/**
 * Builder class for creating gRPC monitor assertions.
 * Provides methods to create assertions for gRPC call responses.
 *
 * @example
 * ```typescript
 * // Response time assertions
 * GrpcAssertionBuilder.responseTime().lessThan(1000)
 *
 * // gRPC status code assertions (e.g. 0 = OK)
 * GrpcAssertionBuilder.statusCode().equals(0)
 *
 * // Health-check status assertions (HEALTH mode)
 * GrpcAssertionBuilder.healthCheckStatus().equals('SERVING')
 *
 * // Response message assertions (BEHAVIOR mode)
 * GrpcAssertionBuilder.responseMessage('$.status').equals('ok')
 *
 * // Response metadata (header) assertions
 * GrpcAssertionBuilder.responseMetadata('content-type').contains('grpc')
 * ```
 */
export class GrpcAssertionBuilder {
  /**
   * Creates an assertion builder for gRPC response time.
   * @returns A numeric assertion builder for response time in milliseconds.
   */
  static responseTime () {
    return new NumericAssertionBuilder<GrpcAssertionSource>('RESPONSE_TIME')
  }

  /**
   * Creates an assertion builder for the gRPC status code.
   * @returns A numeric assertion builder for the gRPC status code.
   */
  static statusCode () {
    return new NumericAssertionBuilder<GrpcAssertionSource>('GRPC_STATUS_CODE')
  }

  /**
   * Creates an assertion builder for the gRPC health-check status (HEALTH mode).
   * `.equals()`/`.notEquals()` accept a friendly {@link GrpcHealthStatus} label
   * (e.g. `'SERVING'`) — or the raw enum number `0`–`3` — and emit the numeric
   * serving-status value the runner evaluates.
   * @returns An assertion builder for the health-check status.
   */
  static healthCheckStatus () {
    return new HealthCheckStatusAssertionBuilder()
  }

  /**
   * Creates an assertion builder for the gRPC response message (BEHAVIOR mode).
   * @param property Optional JSON path to a specific property (e.g., '$.status').
   * @returns A general assertion builder for the response message.
   */
  static responseMessage (property?: string) {
    return new GeneralAssertionBuilder<GrpcAssertionSource>('GRPC_RESPONSE', property)
  }

  /**
   * Creates an assertion builder for the raw gRPC response body as text (BEHAVIOR mode).
   * @param property Optional property path for text content.
   * @returns A general assertion builder for the text response body.
   */
  static textBody (property?: string) {
    return new GeneralAssertionBuilder<GrpcAssertionSource>('TEXT_BODY', property)
  }

  /**
   * Creates an assertion builder for gRPC response metadata (headers).
   * @param property Optional metadata key to assert against.
   * @returns A general assertion builder for the response metadata.
   */
  static responseMetadata (property?: string) {
    return new GeneralAssertionBuilder<GrpcAssertionSource>('GRPC_METADATA', property)
  }
}
