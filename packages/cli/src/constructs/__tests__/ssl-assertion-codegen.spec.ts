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
      // Boolean sources emit a boolean literal, not a quoted string.
      {
        input: { source: 'OCSP_STAPLED', property: '', comparison: 'EQUALS', target: 'true', regex: null },
        expected: 'SslAssertionBuilder.ocspStapled().equals(true)\n',
      },
      {
        input: { source: 'CERT_NOT_EXPIRED', property: '', comparison: 'EQUALS', target: 'true', regex: null },
        expected: 'SslAssertionBuilder.certNotExpired().equals(true)\n',
      },
      {
        input: { source: 'CHAIN_TRUSTED', property: '', comparison: 'EQUALS', target: 'false', regex: null },
        expected: 'SslAssertionBuilder.chainTrusted().equals(false)\n',
      },
      // Numeric key size emits an unquoted number.
      {
        input: { source: 'KEY_SIZE_BITS', property: '', comparison: 'EQUALS', target: '2048', regex: null },
        expected: 'SslAssertionBuilder.keySizeBits().equals(2048)\n',
      },
      // The string sources support the MATCHES (regex) operator.
      {
        input: { source: 'CIPHER_SUITE', property: '', comparison: 'MATCHES', target: 'TLS_(AES|CHACHA)', regex: null },
        expected: 'SslAssertionBuilder.cipherSuite().matches(\'TLS_(AES|CHACHA)\')\n',
      },
    ]
    for (const test of cases) {
      expect(render(test.input)).toEqual(test.expected)
    }
  })
})
