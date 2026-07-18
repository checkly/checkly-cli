import { DnsAssertion } from './dns-assertion'

export type DnsRecordType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'NS'
  | 'TXT'
  | 'SOA'
  | 'HTTPS'
  | 'PTR'
  | 'SRV'
  | 'CAA'
  | 'DS'
  | 'DNSKEY'
  | 'TLSA'
  | 'NAPTR'

export type DnsProtocol =
  | 'UDP'
  | 'TCP'

/**
 * Record change-detection settings for DNS requests. When enabled, the monitor
 * snapshots the normalized answer records on each run and raises a change event
 * when they differ from the confirmed baseline.
 */
export interface DnsChangeDetection {
  /**
   * Whether record change-detection is enabled. When omitted or `false`, the
   * monitor behaves as a plain v1 DNS check with no snapshotting.
   *
   * @default false
   */
  enabled: boolean

  /**
   * When `true`, TTL values are included in the normalized snapshot comparison,
   * so a TTL-only change is treated as a record change. When omitted, TTL is
   * ignored and only the record set (name/type/data) is compared.
   *
   * @default false
   */
  includeTtl?: boolean
}

/**
 * Advanced resolver configuration for DNS requests. All fields are optional;
 * omitted fields fall back to the backend defaults.
 */
export interface DnsConfig {
  /**
   * The maximum time in seconds to wait for each DNS query attempt (applied
   * per attempt in the resolver failover loop).
   *
   * @minimum 1
   * @maximum 30
   * @default 5
   */
  queryTimeoutSeconds?: number

  /**
   * When `true` and `recordType` is not `CNAME`, a CNAME-only answer for the
   * query name is followed to its canonical target (bounded depth, loop
   * detection, shared query-timeout budget) and the final answer feeds the
   * assertions.
   *
   * @default false
   */
  followCname?: boolean

  /**
   * Record change-detection settings. Optional — omit (or set `enabled: false`)
   * to keep plain v1 DNS behavior with no snapshotting.
   */
  changeDetection?: DnsChangeDetection
}

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
   * Advanced resolver configuration (query timeout, CNAME chasing). Optional —
   * omit to use the backend defaults.
   */
  dnsConfig?: DnsConfig

  /**
   * Assertions to validate the DNS response.
   */
  assertions?: Array<DnsAssertion>
}
