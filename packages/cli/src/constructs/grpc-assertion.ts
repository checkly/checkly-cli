import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder } from './internal/assertion.js'

type GrpcAssertionSource =
  | 'RESPONSE_TIME'
  | 'GRPC_STATUS_CODE'
  | 'GRPC_HEALTHCHECK_STATUS'
  | 'GRPC_RESPONSE'
  | 'TEXT_BODY'
  | 'GRPC_METADATA'

export type GrpcAssertion = CoreAssertion<GrpcAssertionSource>

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
   * @returns A general assertion builder for the health-check status.
   */
  static healthCheckStatus () {
    return new GeneralAssertionBuilder<GrpcAssertionSource>('GRPC_HEALTHCHECK_STATUS')
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
