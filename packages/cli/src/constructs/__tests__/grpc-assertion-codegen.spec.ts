import { describe, it, expect } from 'vitest'

import { valueForGrpcAssertion } from '../grpc-assertion-codegen.js'
import { GrpcAssertion } from '../grpc-assertion.js'
import { GeneratedFile, Output } from '../../sourcegen/index.js'

function render (assertion: GrpcAssertion): string {
  const output = new Output()
  const file = new GeneratedFile('foo.ts')
  const result = valueForGrpcAssertion(file, assertion)
  result.render(output)
  return output.finalize()
}

describe('gRPC Assertion Codegen', () => {
  it('round-trips the numeric health-check status target back to its label', () => {
    const cases: { input: GrpcAssertion, expected: string }[] = [
      {
        input: { source: 'GRPC_HEALTHCHECK_STATUS', property: '', comparison: 'EQUALS', target: '0', regex: null },
        expected: 'GrpcAssertionBuilder.healthCheckStatus().equals(\'UNKNOWN\')\n',
      },
      {
        input: { source: 'GRPC_HEALTHCHECK_STATUS', property: '', comparison: 'EQUALS', target: '1', regex: null },
        expected: 'GrpcAssertionBuilder.healthCheckStatus().equals(\'SERVING\')\n',
      },
      {
        input: { source: 'GRPC_HEALTHCHECK_STATUS', property: '', comparison: 'EQUALS', target: '2', regex: null },
        expected: 'GrpcAssertionBuilder.healthCheckStatus().equals(\'NOT_SERVING\')\n',
      },
      {
        input: { source: 'GRPC_HEALTHCHECK_STATUS', property: '', comparison: 'EQUALS', target: '3', regex: null },
        expected: 'GrpcAssertionBuilder.healthCheckStatus().equals(\'SERVICE_UNKNOWN\')\n',
      },
      {
        input: { source: 'GRPC_HEALTHCHECK_STATUS', property: '', comparison: 'NOT_EQUALS', target: '2', regex: null },
        expected: 'GrpcAssertionBuilder.healthCheckStatus().notEquals(\'NOT_SERVING\')\n',
      },
    ]
    for (const test of cases) {
      expect(render(test.input)).toEqual(test.expected)
    }
  })

  it('falls back to a raw assertion object literal for an unmappable health-check status target', () => {
    // '9' is out of the 0-3 serving-status range and isn't a valid label, so a
    // builder call would not type-check against the narrowed `equals`/`notEquals`
    // parameter type. The raw `Assertion` shape compiles (target is a plain string)
    // and faithfully round-trips the stored value instead.
    const input: GrpcAssertion =
      { source: 'GRPC_HEALTHCHECK_STATUS', property: '', comparison: 'EQUALS', target: '9', regex: null }
    expect(render(input)).toEqual(
      '{\n'
      + '  source: \'GRPC_HEALTHCHECK_STATUS\',\n'
      + '  comparison: \'EQUALS\',\n'
      + '  target: \'9\',\n'
      + '  property: \'\',\n'
      + '  regex: null,\n'
      + '}\n',
    )
  })
})
