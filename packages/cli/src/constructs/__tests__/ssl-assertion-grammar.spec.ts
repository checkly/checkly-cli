import { describe, it, expect } from 'vitest'

import { Diagnostics } from '../diagnostics.js'
import { operatorComparisons } from '../internal/assertion-grammar.js'
import { certificateGrammar, connectionGrammar } from '../ssl-assertion-grammar.js'
import { booleanComparisons, numericComparisons, valueForSslAssertion } from '../ssl-assertion-codegen.js'
import { validateSslAssertion } from '../ssl-assertion-validation.js'
import { SslAssertion, SslAssertionBuilder } from '../ssl-assertion.js'
import { GeneratedFile, Output } from '../../sourcegen/index.js'

// The grammar tables in internal/ssl-grammar.ts are the single declaration the builder,
// the validation whitelist, and codegen are all derived from. These tests iterate that
// data and assert the three consumers agree for every declared (property, operator), so a
// drift between them cannot land — replacing the per-class synchronization the previous
// design could not hold by hand.

function render (assertion: SslAssertion): string {
  const output = new Output()
  valueForSslAssertion(new GeneratedFile('foo.ts'), assertion).render(output)
  return output.finalize()
}

// A runtime target of the right shape for a property's value kind. The builder stringifies
// it, so any in-kind value round-trips; validation then accepts it.
function sampleTarget (kind: string): string | number | boolean {
  switch (kind) {
    case 'number':
      return 1
    case 'boolean':
      return true
    default:
      return 'x'
  }
}

const sources = [
  { source: 'CERTIFICATE', method: 'certificate', grammar: certificateGrammar },
  { source: 'CONNECTION', method: 'connection', grammar: connectionGrammar },
] as const

describe('SSL assertion grammar', () => {
  it('routes every declared operator through the public builder to the right wire fields', () => {
    for (const { source, method, grammar } of sources) {
      for (const [property, decl] of Object.entries(grammar)) {
        for (const operator of decl.operators) {
          type Builder = Record<string, (t: unknown) => SslAssertion>
          const builder = (SslAssertionBuilder[method] as (p: string) => Builder)(property)
          const assertion = builder[operator](sampleTarget(decl.target.kind))
          expect(assertion).toMatchObject({
            source,
            property,
            comparison: operatorComparisons[operator],
          })
        }
      }
    }
  })

  it('accepts every declared (property, operator) through validation', () => {
    for (const { source, grammar } of sources) {
      for (const [property, decl] of Object.entries(grammar)) {
        for (const operator of decl.operators) {
          const assertion: SslAssertion = {
            source,
            property,
            comparison: operatorComparisons[operator],
            target: String(sampleTarget(decl.target.kind)),
            regex: null,
          }
          const diags = new Diagnostics()
          validateSslAssertion(diags, assertion, 0)
          expect(diags.isFatal(), `${source}.${property}.${operator} should validate`).toEqual(false)
        }
      }
    }
  })

  it('renders every declared (property, operator) naming the same property and operator', () => {
    for (const { method, grammar } of sources) {
      for (const [property, decl] of Object.entries(grammar)) {
        for (const operator of decl.operators) {
          const assertion: SslAssertion = {
            source: method === 'certificate' ? 'CERTIFICATE' : 'CONNECTION',
            property,
            comparison: operatorComparisons[operator],
            target: String(sampleTarget(decl.target.kind)),
            regex: null,
          }
          const source = render(assertion)
          expect(source).toContain(`SslAssertionBuilder.${method}('${property}')`)
          expect(source).toContain(`.${operator}(`)
        }
      }
    }
  })

  // Codegen renders a number target as a bare number literal and a boolean as a bare
  // boolean, both only for the comparisons it has typed paths for. A property of that kind
  // declaring any other operator would fall through to the quoted-string form, which does
  // not compile against the property's typed builder method — the drift this guards against.
  //
  // The renderable sets are codegen's own predicates (numericComparisons / booleanComparisons),
  // not restated here, so this cannot fall out of step with what codegen actually renders.
  it('lets number and boolean properties declare only operators codegen renders as literals', () => {
    const renderableFor: Record<string, Record<string, true>> = {
      number: numericComparisons,
      boolean: booleanComparisons,
    }
    for (const { grammar } of sources) {
      for (const [property, decl] of Object.entries(grammar)) {
        const renderable = renderableFor[decl.target.kind]
        if (renderable === undefined) {
          continue
        }
        for (const operator of decl.operators) {
          const comparison = operatorComparisons[operator]
          expect(Object.hasOwn(renderable, comparison), `${property}.${operator} is not rendered as a ${decl.target.kind} literal`).toBe(true)
        }
      }
    }
  })
})
