import { describe, it, expect } from 'vitest'

import { GeneratedFile } from '../../sourcegen/index.js'
import { valueForAssertion } from '../api-assertion-codegen.js'
import { valueForDnsAssertion } from '../dns-assertion-codegen.js'
import { valueForGrpcAssertion } from '../grpc-assertion-codegen.js'
import { valueForIcmpAssertion } from '../icmp-assertion-codegen.js'
import { valueForSslAssertion } from '../ssl-assertion-codegen.js'
import { valueForTcpAssertion } from '../tcp-monitor-codegen.js'
import { valueForTracerouteAssertion } from '../traceroute-assertion-codegen.js'
import { valueForUrlAssertion } from '../url-assertion-codegen.js'

const genfile = new GeneratedFile('foo.ts')

// A source no assertion union contains. The compile-time exhaustiveness guard is
// what normally prevents this, so reaching it requires bypassing the type — wire
// data from a newer backend can still carry such a source at runtime.
const unknownSource = {
  source: 'NOT_A_REAL_SOURCE',
  property: '',
  comparison: 'EQUALS',
  target: 'x',
  regex: null,
} as unknown as never

describe('unsupportedAssertionSource', () => {
  // Locks the exact user-visible text of every assertion-source default clause.
  // The shared helper builds these messages from an optional `kind`, so a
  // regression there (an empty-string kind, a changed template) would otherwise
  // pass silently — note the API check's message deliberately carries no kind word.
  it.each([
    ['API', () => valueForAssertion(genfile, unknownSource), 'Unsupported assertion source NOT_A_REAL_SOURCE'],
    ['DNS', () => valueForDnsAssertion(genfile, unknownSource), 'Unsupported DNS assertion source NOT_A_REAL_SOURCE'],
    ['gRPC', () => valueForGrpcAssertion(genfile, unknownSource), 'Unsupported gRPC assertion source NOT_A_REAL_SOURCE'],
    ['ICMP', () => valueForIcmpAssertion(genfile, unknownSource), 'Unsupported ICMP assertion source NOT_A_REAL_SOURCE'],
    ['SSL', () => valueForSslAssertion(genfile, unknownSource), 'Unsupported SSL assertion source NOT_A_REAL_SOURCE'],
    ['TCP', () => valueForTcpAssertion(genfile, unknownSource), 'Unsupported TCP assertion source NOT_A_REAL_SOURCE'],
    [
      'traceroute',
      () => valueForTracerouteAssertion(genfile, unknownSource),
      'Unsupported traceroute assertion source NOT_A_REAL_SOURCE',
    ],
    ['URL', () => valueForUrlAssertion(genfile, unknownSource), 'Unsupported URL assertion source NOT_A_REAL_SOURCE'],
  ])('%s codegen throws with its own message for an unknown source', (_name, valueFor, message) => {
    let thrown: unknown
    try {
      valueFor()
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe(message)
  })
})
