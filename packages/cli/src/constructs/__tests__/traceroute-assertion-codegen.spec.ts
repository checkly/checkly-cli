import { describe, it, expect } from 'vitest'

import { valueForTracerouteAssertion } from '../traceroute-assertion-codegen.js'
import { TracerouteAssertion } from '../traceroute-assertion.js'
import { GeneratedFile, Output } from '../../sourcegen/index.js'

function render (assertion: TracerouteAssertion): string {
  const output = new Output()
  const file = new GeneratedFile('foo.ts')
  const result = valueForTracerouteAssertion(file, assertion)
  result.render(output)
  return output.finalize()
}

describe('Traceroute Assertion Codegen', () => {
  it('preserves the response-time property as an argument', () => {
    const cases: { input: TracerouteAssertion, expected: string }[] = [
      {
        input: { source: 'RESPONSE_TIME', property: 'max', comparison: 'LESS_THAN', target: '1000', regex: null },
        expected: 'TracerouteAssertionBuilder.responseTime(\'max\').lessThan(1000)\n',
      },
      {
        input: { source: 'RESPONSE_TIME', property: 'min', comparison: 'GREATER_THAN', target: '10', regex: null },
        expected: 'TracerouteAssertionBuilder.responseTime(\'min\').greaterThan(10)\n',
      },
      {
        input: { source: 'RESPONSE_TIME', property: 'stdDev', comparison: 'LESS_THAN', target: '50', regex: null },
        expected: 'TracerouteAssertionBuilder.responseTime(\'stdDev\').lessThan(50)\n',
      },
      {
        input: { source: 'RESPONSE_TIME', property: 'avg', comparison: 'LESS_THAN', target: '1000', regex: null },
        expected: 'TracerouteAssertionBuilder.responseTime(\'avg\').lessThan(1000)\n',
      },
    ]
    for (const test of cases) {
      expect(render(test.input)).toEqual(test.expected)
    }
  })

  // Codegen runs in the decode direction: backend wire data becomes construct source.
  // The backend only ever returns one of 'avg', 'min', 'max' or 'stdDev' as the property
  // of a RESPONSE_TIME assertion, so this input is synthetic. The bare responseTime() it
  // emits still compiles and resolves to the 'avg' default. Codegen relies on that
  // guarantee: a property outside the union would emit source that does not typecheck.
  // The encode direction is guarded separately by validateTracerouteAssertion, which
  // rejects a hand-written empty property at deploy time.
  it('emits a bare responseTime() when no property is set', () => {
    const input: TracerouteAssertion =
      { source: 'RESPONSE_TIME', property: '', comparison: 'LESS_THAN', target: '1000', regex: null }
    expect(render(input)).toEqual('TracerouteAssertionBuilder.responseTime().lessThan(1000)\n')
  })

  it('does not emit a property for HOP_COUNT / PACKET_LOSS', () => {
    const hop: TracerouteAssertion =
      { source: 'HOP_COUNT', property: '', comparison: 'LESS_THAN', target: '20', regex: null }
    expect(render(hop)).toEqual('TracerouteAssertionBuilder.hopCount().lessThan(20)\n')

    const loss: TracerouteAssertion =
      { source: 'PACKET_LOSS', property: '', comparison: 'LESS_THAN', target: '10', regex: null }
    expect(render(loss)).toEqual('TracerouteAssertionBuilder.packetLoss().lessThan(10)\n')
  })
})
