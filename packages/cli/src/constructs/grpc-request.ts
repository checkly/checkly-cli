import { GrpcAssertion } from './grpc-assertion.js'
import { IPFamily } from './ip.js'

/**
 * The gRPC monitoring mode.
 *
 * - `BEHAVIOR` invokes a unary method (requires `method`).
 * - `HEALTH` queries the standard gRPC health-check service (allows `service`).
 */
export type GrpcMode = 'BEHAVIOR' | 'HEALTH'

/**
 * How the service definition is resolved in `BEHAVIOR` mode.
 *
 * - `REFLECTION` uses server reflection.
 * - `PROTO_FILE` uses the inline `protoContent`.
 */
export type GrpcServiceDefinition = 'REFLECTION' | 'PROTO_FILE'

/**
 * A single gRPC metadata (request header) key/value pair.
 */
export interface GrpcMetadata {
  /**
   * The gRPC metadata (header) key.
   */
  key: string

  /**
   * The gRPC metadata (header) value.
   */
  value: string
}

/**
 * gRPC-specific configuration nested inside a gRPC monitor's request.
 */
export interface GrpcConfig {
  /**
   * The gRPC monitoring mode. `BEHAVIOR` invokes a unary method (requires
   * `method`); `HEALTH` queries the standard gRPC health-check service (allows
   * `service`).
   *
   * @defaultValue "BEHAVIOR"
   */
  mode?: GrpcMode

  /**
   * Whether to use a TLS-encrypted connection to the gRPC server.
   *
   * @defaultValue true
   */
  tls?: boolean

  /**
   * Whether to store the gRPC response body with the check result.
   *
   * @defaultValue true
   */
  storeResponseBody?: boolean

  /**
   * gRPC metadata (request headers) sent with the call.
   */
  metadata?: Array<GrpcMetadata>

  /**
   * How the service definition is resolved in `BEHAVIOR` mode: `REFLECTION`
   * uses server reflection; `PROTO_FILE` uses the inline `protoContent`.
   * Forbidden in `HEALTH` mode.
   *
   * @defaultValue "REFLECTION"
   */
  serviceDefinition?: GrpcServiceDefinition

  /**
   * The fully-qualified gRPC method to invoke in `BEHAVIOR` mode (e.g.
   * `package.Service/Method`). Required in `BEHAVIOR` mode; forbidden in
   * `HEALTH` mode.
   *
   * @example "/grpc.health.v1.Health/Check"
   */
  method?: string

  /**
   * The inline `.proto` file source used when `serviceDefinition` is
   * `PROTO_FILE` in `BEHAVIOR` mode.
   */
  protoContent?: string

  /**
   * The JSON request message sent as the gRPC call payload in `BEHAVIOR` mode.
   */
  message?: string

  /**
   * The service name to query in `HEALTH` mode. An empty value queries overall
   * server health. Forbidden in `BEHAVIOR` mode.
   */
  service?: string
}

/**
 * Configuration for gRPC requests.
 * Defines the connection parameters and validation rules.
 */
export interface GrpcRequest {
  /**
   * The host to connect to. Do not include a scheme or a port in this value.
   *
   * @example "grpc.example.com"
   */
  url: string

  /**
   * The port number to connect to.
   *
   * @minimum 1
   * @maximum 65535
   * @example 50051
   */
  port: number

  /**
   * The IP family to use when executing the gRPC check.
   *
   * @defaultValue "IPv4"
   */
  ipFamily?: IPFamily

  /**
   * Whether to skip SSL certificate validation when `tls` is enabled.
   *
   * @defaultValue false
   */
  skipSSL?: boolean

  /**
   * The number of seconds to wait for the gRPC call to complete before timing
   * out.
   *
   * @minimum 1
   * @maximum 180
   * @defaultValue 60
   */
  timeout?: number

  /**
   * The gRPC-specific configuration for the call.
   */
  grpcConfig: GrpcConfig

  /**
   * Assertions to validate the gRPC response.
   */
  assertions?: Array<GrpcAssertion>
}
