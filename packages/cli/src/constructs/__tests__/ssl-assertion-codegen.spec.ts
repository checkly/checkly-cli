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
      // Numeric properties emit an unquoted number, matching the builder's typed target.
      {
        input: { source: 'CERTIFICATE', property: 'daysUntilExpiry', comparison: 'GREATER_THAN', target: '30', regex: null },
        expected: 'SslAssertionBuilder.certificate(\'daysUntilExpiry\').greaterThan(30)\n',
      },
      {
        input: { source: 'CERTIFICATE', property: 'signatureAlgorithm', comparison: 'EQUALS', target: 'SHA256-RSA', regex: null },
        expected: 'SslAssertionBuilder.certificate(\'signatureAlgorithm\').equals(\'SHA256-RSA\')\n',
      },
      // Boolean properties emit a boolean literal, not a quoted string.
      {
        input: { source: 'CERTIFICATE', property: 'selfSigned', comparison: 'EQUALS', target: 'false', regex: null },
        expected: 'SslAssertionBuilder.certificate(\'selfSigned\').equals(false)\n',
      },
      {
        input: { source: 'CONNECTION', property: 'chainTrusted', comparison: 'EQUALS', target: 'true', regex: null },
        expected: 'SslAssertionBuilder.connection(\'chainTrusted\').equals(true)\n',
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
      // TEXT_RESPONSE carries its regex in the property slot (the backend/runner contract).
      {
        input: { source: 'TEXT_RESPONSE', property: '', comparison: 'CONTAINS', target: 'healthy', regex: null },
        expected: 'SslAssertionBuilder.textResponse().contains(\'healthy\')\n',
      },
      {
        input: { source: 'TEXT_RESPONSE', property: 'status: (\\w+)', comparison: 'EQUALS', target: 'ok', regex: null },
        expected: 'SslAssertionBuilder.textResponse(\'status: (\\\\w+)\').equals(\'ok\')\n',
      },
    ]
    for (const test of cases) {
      expect(render(test.input)).toEqual(test.expected)
    }
  })

  // The backend accepts any target string, so a monitor created via the UI or API can
  // carry a target the builder's typed operators cannot express. Rendering it as a typed
  // literal anyway would rewrite the assertion on the next deploy ('yes' becoming false,
  // '30.5' becoming 30), so these fall back to the string form, which preserves the value.
  it('does not coerce a target its typed operators cannot express', () => {
    const cases: { input: SslAssertion, expected: string }[] = [
      {
        input: { source: 'CERTIFICATE', property: 'selfSigned', comparison: 'EQUALS', target: 'yes', regex: null },
        expected: 'SslAssertionBuilder.certificate(\'selfSigned\').equals(\'yes\')\n',
      },
      {
        input: { source: 'CERTIFICATE', property: 'keySizeBits', comparison: 'EQUALS', target: '', regex: null },
        expected: 'SslAssertionBuilder.certificate(\'keySizeBits\').equals(\'\')\n',
      },
      {
        input: { source: 'CERTIFICATE', property: 'daysUntilExpiry', comparison: 'GREATER_THAN', target: 'abc', regex: null },
        expected: 'SslAssertionBuilder.certificate(\'daysUntilExpiry\').greaterThan(\'abc\')\n',
      },
      {
        // parseInt would take the leading prefix and silently assert against 5.
        input: { source: 'CERTIFICATE', property: 'keySizeBits', comparison: 'EQUALS', target: '5%', regex: null },
        expected: 'SslAssertionBuilder.certificate(\'keySizeBits\').equals(\'5%\')\n',
      },
    ]
    for (const test of cases) {
      expect(render(test.input)).toEqual(test.expected)
    }
  })

  // Codegen must render every target validateSslAssertion accepts as a numeric literal:
  // the property's operators take a number, so a quoted target would not compile. parseInt
  // would truncate the fractional and exponent forms.
  it('renders every numeric target validation accepts as a number literal', () => {
    const cases: { target: string, expected: string }[] = [
      { target: '30', expected: '30' },
      { target: '30.5', expected: '30.5' },
      { target: '0.5', expected: '0.5' },
      { target: '1e3', expected: '1000' },
      { target: '-5', expected: '-5' },
      { target: ' 30 ', expected: '30' },
    ]
    for (const { target, expected } of cases) {
      expect(render(
        { source: 'CERTIFICATE', property: 'daysUntilExpiry', comparison: 'GREATER_THAN', target, regex: null },
      )).toEqual(`SslAssertionBuilder.certificate('daysUntilExpiry').greaterThan(${expected})\n`)
    }
  })

  // A comparison outside a typed helper's set makes the helper throw, which would abort
  // the whole import over one assertion.
  it('renders rather than throws on a comparison the property does not support', () => {
    expect(render(
      { source: 'CERTIFICATE', property: 'daysUntilExpiry', comparison: 'CONTAINS', target: '30', regex: null },
    )).toEqual('SslAssertionBuilder.certificate(\'daysUntilExpiry\').contains(\'30\')\n')
    expect(render(
      { source: 'CERTIFICATE', property: 'selfSigned', comparison: 'NOT_EQUALS', target: 'true', regex: null },
    )).toEqual('SslAssertionBuilder.certificate(\'selfSigned\').notEquals(\'true\')\n')
  })

  // An unknown property reaches codegen from remote data; validation reports it.
  it('renders an unknown property rather than throwing', () => {
    expect(render(
      { source: 'CERTIFICATE', property: 'bogusProperty', comparison: 'EQUALS', target: 'x', regex: null },
    )).toEqual('SslAssertionBuilder.certificate(\'bogusProperty\').equals(\'x\')\n')
  })
})
