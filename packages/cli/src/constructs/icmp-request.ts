import { IcmpAssertion } from './icmp-assertion'
import { IPFamily } from './ip'

/**
 * Configuration for ICMP ping requests.
 * Defines the target host and ping parameters.
 */
export interface IcmpRequest {
  /**
   * The domain name or IP address to ping.
   *
   * @example "www.example.com"
   * @example "199.43.133.53"
   */
  hostname: string

  /**
   * The IP protocol version to use for pinging.
   *
   * @example "IPv4"
   * @example "IPv6"
   * @default "IPv4"
   */
  ipFamily?: IPFamily

  /**
   * The number of ICMP echo requests (pings) to send. This allows you to see
   * and assert how many packets were received.
   *
   * @minimum 1
   * @maximum 100
   * @example 10
   * @default 10
   */
  pingCount?: number

  /**
   * Assertions to validate the ICMP response.
   */
  assertions?: Array<IcmpAssertion>
}
