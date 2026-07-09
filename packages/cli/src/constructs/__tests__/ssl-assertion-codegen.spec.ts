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
        input: { source: 'OCSP_STAPLED', property: '', comparison: 'EQUALS', target: 'true', regex: null },
        expected: 'SslAssertionBuilder.ocspStapled().equals(\'true\')\n',
      },
    ]
    for (const test of cases) {
      expect(render(test.input)).toEqual(test.expected)
    }
  })
})
