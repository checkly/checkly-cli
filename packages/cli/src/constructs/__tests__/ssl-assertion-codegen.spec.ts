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
  it('generates the property-scoped SSL assertion sources', () => {
    const cases: { input: SslAssertion, expected: string }[] = [
      // CERTIFICATE / CONNECTION emit the property name as the first call argument.
      {
        input: { source: 'CERTIFICATE', property: 'daysUntilExpiry', comparison: 'GREATER_THAN', target: '30', regex: null },
        expected: 'SslAssertionBuilder.certificate(\'daysUntilExpiry\').greaterThan(\'30\')\n',
      },
      {
        input: { source: 'CERTIFICATE', property: 'signatureAlgorithm', comparison: 'EQUALS', target: 'SHA256-RSA', regex: null },
        expected: 'SslAssertionBuilder.certificate(\'signatureAlgorithm\').equals(\'SHA256-RSA\')\n',
      },
      {
        input: { source: 'CERTIFICATE', property: 'selfSigned', comparison: 'EQUALS', target: 'false', regex: null },
        expected: 'SslAssertionBuilder.certificate(\'selfSigned\').equals(\'false\')\n',
      },
      {
        input: { source: 'CONNECTION', property: 'tlsVersion', comparison: 'EQUALS', target: 'TLS1.3', regex: null },
        expected: 'SslAssertionBuilder.connection(\'tlsVersion\').equals(\'TLS1.3\')\n',
      },
      // RESPONSE_TIME is numeric — the target is an unquoted number and no property is emitted.
      {
        input: { source: 'RESPONSE_TIME', property: '', comparison: 'LESS_THAN', target: '1000', regex: null },
        expected: 'SslAssertionBuilder.responseTime().lessThan(1000)\n',
      },
      // JSON_RESPONSE emits the JSONPath property.
      {
        input: { source: 'JSON_RESPONSE', property: '$.status', comparison: 'EQUALS', target: 'ok', regex: null },
        expected: 'SslAssertionBuilder.jsonResponse(\'$.status\').equals(\'ok\')\n',
      },
      // TEXT_RESPONSE emits the regex slot, not a property.
      {
        input: { source: 'TEXT_RESPONSE', property: '', comparison: 'CONTAINS', target: 'healthy', regex: null },
        expected: 'SslAssertionBuilder.textResponse().contains(\'healthy\')\n',
      },
      {
        input: { source: 'TEXT_RESPONSE', property: '', comparison: 'EQUALS', target: 'ok', regex: 'status: OK' },
        expected: 'SslAssertionBuilder.textResponse(\'status: OK\').equals(\'ok\')\n',
      },
    ]
    for (const test of cases) {
      expect(render(test.input)).toEqual(test.expected)
    }
  })
})
