import { TracerouteAssertion } from './traceroute-assertion.js'
import { IPFamily } from './ip.js'

/**
 * The traceroute probe protocol.
 *
 * - `TCP` sends SYN probes (default).
 * - `UDP` sends datagrams to a high port.
 * - `ICMP` sends Echo Requests.
 * - `SCTP` sends INIT chunks.
 */
export type TracerouteProtocol =
  | 'TCP'
  | 'UDP'
  | 'ICMP'
  | 'SCTP'

/**
 * Configuration for traceroute requests.
 * Defines the probe parameters and validation rules.
 */
export interface TracerouteRequest {
  /**
   * The host to trace the network path to. Do not include a scheme or a port in
   * this value.
   *
   * @example "example.com"
   */
  url: string

  /**
   * The probe protocol.
   *
   * @default "TCP"
   */
  protocol?: TracerouteProtocol

  /**
   * The destination port for TCP/UDP/SCTP probes. Ignored (and not sent) when
   * `protocol` is `ICMP`.
   *
   * @minimum 1
   * @maximum 65535
   * @default 443
   */
  port?: number

  /**
   * The IP family to use when executing the traceroute.
   *
   * @default "IPv4"
   */
  ipFamily?: IPFamily

  /**
   * The maximum number of network hops to probe before stopping.
   *
   * @minimum 1
   * @maximum 64
   * @default 30
   */
  maxHops?: number

  /**
   * The maximum number of consecutive unresponsive hops to tolerate before
   * stopping the trace.
   *
   * @minimum 1
   * @maximum 30
   * @default 15
   */
  maxUnknownHops?: number

  /**
   * Whether to perform reverse-DNS (PTR) lookups on each hop's IP address.
   *
   * @default true
   */
  ptrLookup?: boolean

  /**
   * The number of seconds to wait for the traceroute to complete before timing
   * out.
   *
   * @minimum 1
   * @maximum 30
   * @default 10
   */
  timeout?: number

  /**
   * Assertions to validate the traceroute response.
   */
  assertions?: Array<TracerouteAssertion>
}
