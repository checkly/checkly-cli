import { describe, it, expect } from 'vitest'

import { valueForSslAssertion } from '../ssl-assertion-codegen.js'
import { SslAssertion } from '../ssl-assertion.js'
import { GeneratedFile, Output } from '../../sourcegen/index.js'

function render (assertion: SslAssertion): string {
  const output = new Output()
  const file = new GeneratedFile('foo.ts')
  const result = valueForSslAssertion(file, assertion)
  result.render(output)
  return output.finalize()
}

describe('SSL Assertion Codegen', () => {
  it('generates the new SSL assertion sources', () => {
    const cases: { input: SslAssertion, expected: string }[] = [
      {
        input: { source: 'HANDSHAKE_TIME_MS', property: '', comparison: 'LESS_THAN', target: '500', regex: null },
        expected: 'SslAssertionBuilder.handshakeTimeMs().lessThan(500)\n',
      },
      {
        input: { source: 'OCSP_STAPLED', property: '', comparison: 'EQUALS', target: 'true', regex: null },
        expected: "SslAssertionBuilder.ocspStapled().equals('true')\n",
      },
      {
        input: { source: 'SAN_CONTAINS', property: '', comparison: 'EQUALS', target: 'example.com', regex: null },
        expected: "SslAssertionBuilder.sanContains().equals('example.com')\n",
      },
    ]
    for (const test of cases) {
      expect(render(test.input)).toEqual(test.expected)
    }
  })

  it('generates the new comparison operators', () => {
    const cases: { input: SslAssertion, expected: string }[] = [
      {
        input: { source: 'KEY_SIZE_BITS', property: '', comparison: 'GREATER_THAN_OR_EQUAL', target: '2048', regex: null },
        expected: 'SslAssertionBuilder.keySizeBits().greaterThanOrEqual(2048)\n',
      },
      {
        input: { source: 'TLS_VERSION', property: '', comparison: 'GREATER_THAN_OR_EQUAL', target: 'TLS1.2', regex: null },
        expected: "SslAssertionBuilder.tlsVersion().greaterThanOrEqual('TLS1.2')\n",
      },
      {
        input: { source: 'CIPHER_SUITE', property: '', comparison: 'MATCHES', target: '^TLS_AES_.*', regex: null },
        expected: "SslAssertionBuilder.cipherSuite().matches('^TLS_AES_.*')\n",
      },
    ]
    for (const test of cases) {
      expect(render(test.input)).toEqual(test.expected)
    }
  })
})
