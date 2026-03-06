import { TracerouteAssertion } from './traceroute-assertion'
import { IPFamily } from './ip'

/**
 * Configuration for traceroute requests.
 * Defines the target host and traceroute parameters.
 */
export interface TracerouteRequest {
  /**
   * The domain name or IP address to trace.
   *
   * @example "www.example.com"
   * @example "199.43.133.53"
   */
  hostname: string

  /**
   * The port to connect to.
   *
   * @minimum 1
   * @maximum 65535
   * @default 443
   */
  port?: number

  /**
   * The IP protocol version to use.
   *
   * @example "IPv4"
   * @example "IPv6"
   * @default "IPv4"
   */
  ipFamily?: IPFamily

  /**
   * The maximum number of hops to trace.
   *
   * @minimum 1
   * @maximum 64
   * @default 30
   */
  maxHops?: number

  /**
   * The maximum number of consecutive unknown hops before stopping.
   *
   * @minimum 1
   * @maximum 64
   * @default 15
   */
  maxUnknownHops?: number

  /**
   * Whether to perform PTR (reverse DNS) lookups for each hop.
   *
   * @default true
   */
  ptrLookup?: boolean

  /**
   * The timeout in seconds for each hop probe.
   *
   * @minimum 1
   * @maximum 60
   * @default 10
   */
  timeout?: number

  /**
   * Assertions to validate the traceroute response.
   */
  assertions?: Array<TracerouteAssertion>
}
