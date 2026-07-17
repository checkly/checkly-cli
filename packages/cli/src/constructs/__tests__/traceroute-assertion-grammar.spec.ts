import { describe, it, expect } from 'vitest'

import { Diagnostics } from '../diagnostics.js'
import { operatorComparisons } from '../internal/assertion-grammar.js'
import { hopCountGrammar, packetLossGrammar, tracerouteResponseTimeGrammar } from '../traceroute-assertion-grammar.js'
import { valueForTracerouteAssertion } from '../traceroute-assertion-codegen.js'
import { validateTracerouteAssertion } from '../traceroute-assertion-validation.js'
import { TracerouteAssertion, TracerouteAssertionBuilder } from '../traceroute-assertion.js'
import { GeneratedFile, Output } from '../../sourcegen/index.js'

// The traceroute grammar tables in traceroute-assertion-grammar.ts are the single
// declaration the builder and the validation whitelist derive from. These tests iterate
// that data and assert the two consumers agree for every declared (source, property,
// operator), so a drift between them cannot land.

function render (assertion: TracerouteAssertion): string {
  const output = new Output()
  valueForTracerouteAssertion(new GeneratedFile('foo.ts'), assertion).render(output)
  return output.finalize()
}

// Every traceroute source is numeric; the builder call for one declared operator.
const cases = [
  ...Object.entries(tracerouteResponseTimeGrammar).flatMap(([property, decl]) =>
    decl.operators.map(operator => ({
      source: 'RESPONSE_TIME' as const, property, operator, method: 'responseTime',
    }))),
  ...hopCountGrammar.operators.map(operator => ({
    source: 'HOP_COUNT' as const, property: '', operator, method: 'hopCount',
  })),
  ...packetLossGrammar.operators.map(operator => ({
    source: 'PACKET_LOSS' as const, property: '', operator, method: 'packetLoss',
  })),
]

describe('traceroute assertion grammar', () => {
  it('routes every declared operator through the public builder to the right wire fields', () => {
    type Ops = Record<string, (t: number) => TracerouteAssertion>
    for (const { source, property, operator } of cases) {
      const call = source === 'RESPONSE_TIME'
        ? (TracerouteAssertionBuilder.responseTime as (p: string) => Ops)(property)
        : (TracerouteAssertionBuilder[source === 'HOP_COUNT' ? 'hopCount' : 'packetLoss']() as unknown as Ops)
      expect(call[operator](1)).toMatchObject({
        source,
        property,
        comparison: operatorComparisons[operator],
      })
    }
  })

  it('accepts every declared (source, property, operator) through validation', () => {
    for (const { source, property, operator } of cases) {
      const assertion: TracerouteAssertion = {
        source,
        property,
        comparison: operatorComparisons[operator],
        target: '1',
        regex: null,
      }
      const diags = new Diagnostics()
      validateTracerouteAssertion(diags, assertion, 0)
      expect(diags.isFatal(), `${source}.${property || '(none)'}.${operator} should validate`).toEqual(false)
    }
  })

  // Validation consults each property's own grammar row, so a comparison no response-time
  // property declares is rejected rather than accepted wholesale. (A cross-property
  // divergence — one property dropping an operator another keeps — cannot be expressed as a
  // static case while all rows are identical; the per-property derivation prevents it
  // structurally, and this guards that validation is strict rather than accept-all.)
  it('rejects a comparison a property does not declare', () => {
    for (const property of Object.keys(tracerouteResponseTimeGrammar)) {
      const diags = new Diagnostics()
      validateTracerouteAssertion(
        diags,
        { source: 'RESPONSE_TIME', property, comparison: 'CONTAINS', target: '1', regex: null },
        0,
      )
      expect(diags.isFatal(), `RESPONSE_TIME.${property} should reject CONTAINS`).toEqual(true)
    }
  })

  it('renders every declared (source, property, operator) naming the same method and operator', () => {
    for (const { source, property, operator, method } of cases) {
      const assertion: TracerouteAssertion = {
        source,
        property,
        comparison: operatorComparisons[operator],
        target: '1',
        regex: null,
      }
      const generated = render(assertion)
      expect(generated).toContain(`TracerouteAssertionBuilder.${method}(`)
      expect(generated).toContain(`.${operator}(`)
      if (source === 'RESPONSE_TIME') {
        expect(generated).toContain(`responseTime('${property}')`)
      }
    }
  })
})
