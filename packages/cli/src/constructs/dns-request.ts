import { DnsAssertion } from './dns-assertion'

export type DnsRecordType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'NS'
  | 'TXT'
  | 'SOA'

export type DnsProtocol =
  | 'UDP'
  | 'TCP'

/**
 * Configuration for DNS requests.
 * Defines the query parameters and validation rules.
 */
export interface DnsRequest {
  /**
   * The DNS record type to query for.
   *
   * @example "A"
   * @example "AAAA"
   * @example "TXT"
   */
  recordType: DnsRecordType

  /**
   * The DNS query. Value should be appropriate for the record type you've
   * selected.
   *
   * @example 'api.example.com' | '192.168.1.1'
   */
  query: string

  /**
   * The name server the query should be made to. If not set, an appropriate
   * name server will be used automatically.
   *
   * @example "8.8.4.4"
   * @example "resolver1.opendns.com"
   */
  nameServer?: string

  /**
   * The port of the name server.
   *
   * @minimum 1
   * @maximum 65535
   * @example 53
   * @default 53
   */
  port?: number

  /**
   * The protocol used to connect to the name server.
   *
   * @example "UDP"
   * @example "TCP"
   * @default "UDP"
   */
  protocol?: DnsProtocol

  /**
   * Assertions to validate the DNS response.
   */
  assertions?: Array<DnsAssertion>
}
