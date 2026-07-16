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
   * @defaultValue "TCP"
   */
  protocol?: TracerouteProtocol

  /**
   * The destination port for TCP/UDP/SCTP probes. Ignored (and not sent) when
   * `protocol` is `ICMP`. When omitted, the default is protocol-dependent: `443`
   * for TCP, and `33434` (a closed high port) for UDP/SCTP — UDP/SCTP arrival is
   * only confirmed by an ICMP "port unreachable" from a closed port, whereas 443
   * is typically open and would never confirm arrival.
   *
   * @minimum 1
   * @maximum 65535
   * @defaultValue 443 for TCP, 33434 for UDP/SCTP
   */
  port?: number

  /**
   * The IP family to use when executing the traceroute.
   *
   * @defaultValue "IPv4"
   */
  ipFamily?: IPFamily

  /**
   * The maximum number of network hops to probe before stopping.
   *
   * @minimum 1
   * @maximum 64
   * @defaultValue 30
   */
  maxHops?: number

  /**
   * The maximum number of consecutive unresponsive hops to tolerate before
   * stopping the trace.
   *
   * @minimum 1
   * @maximum 30
   * @defaultValue 15
   */
  maxUnknownHops?: number

  /**
   * Whether to perform reverse-DNS (PTR) lookups on each hop's IP address.
   *
   * @defaultValue true
   */
  ptrLookup?: boolean

  /**
   * The number of seconds to wait for the traceroute to complete before timing
   * out.
   *
   * @minimum 1
   * @maximum 30
   * @defaultValue 10
   */
  timeout?: number

  /**
   * Assertions to validate the traceroute response.
   */
  assertions?: Array<TracerouteAssertion>
}
