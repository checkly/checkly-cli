import { GeneratedFile, Value } from '../sourcegen/index.js'
import {
  unsupportedAssertionSource,
  valueForBooleanAssertion,
  valueForGeneralAssertion,
  valueForNumericAssertion,
} from './internal/assertion-codegen.js'
import { isSslNumericTarget, sslPropertyValueType } from './internal/ssl-properties.js'
import { SslAssertion } from './ssl-assertion.js'

// Every SSL source addresses its value through the property slot — CERTIFICATE /
// CONNECTION use a field selector, JSON_RESPONSE a JSONPath, and TEXT_RESPONSE a
// regex (the backend and runner read the TEXT_RESPONSE pattern from `property`,
// not `regex`). The regex slot is never emitted.
const withProperty = { hasProperty: true, hasRegex: false }

// The comparisons each typed helper can render. A comparison outside the set makes the
// helper throw, which would abort the whole import over a single assertion, so the
// dispatch below checks membership rather than relying on the throw.
const numericComparisons: Record<string, true> = {
  EQUALS: true, NOT_EQUALS: true, GREATER_THAN: true, LESS_THAN: true,
}

// The operators for a numeric or boolean property take a `number` / `boolean`, so their
// targets must be emitted as bare literals rather than quoted strings — otherwise the
// generated code does not compile.
//
// Each typed path is guarded on the assertion actually fitting it, because remote data is
// not bound by the builder's types: the backend accepts any target string, so a monitor
// created via the UI or API can carry `selfSigned = 'yes'` or `keySizeBits = ''`. Coercing
// those would silently rewrite the assertion on the next deploy ('yes' would become
// `false`), so they fall through to the string form, which round-trips the value untouched
// and is reported by validateSslAssertion instead.
function valueForPropertyScopedAssertion (method: string, assertion: SslAssertion): Value {
  const valueType = sslPropertyValueType(assertion.source, assertion.property)

  // Rendered with Number, not the helper's default parseInt: isSslNumericTarget has
  // already established the whole target is a number, and parseInt would truncate '30.5'
  // to 30 — a silently different assertion on the next deploy. Sharing the predicate with
  // validateSslAssertion is what keeps the two honest: every target validation accepts is
  // rendered as a numeric literal the property's operators take, so no assertion the CLI
  // calls valid is emitted as code that does not compile.
  const isRenderableNumber = valueType === 'number'
    && Object.hasOwn(numericComparisons, assertion.comparison)
    && isSslNumericTarget(assertion.target)
  if (isRenderableNumber) {
    return valueForNumericAssertion('SslAssertionBuilder', method, assertion, {
      hasProperty: true,
      parse: Number,
    })
  }

  const isRenderableBoolean = valueType === 'boolean'
    && assertion.comparison === 'EQUALS'
    && (assertion.target === 'true' || assertion.target === 'false')
  if (isRenderableBoolean) {
    return valueForBooleanAssertion('SslAssertionBuilder', method, assertion, { hasProperty: true })
  }

  return valueForGeneralAssertion('SslAssertionBuilder', method, assertion, withProperty)
}

export function valueForSslAssertion (genfile: GeneratedFile, assertion: SslAssertion): Value {
  genfile.namedImport('SslAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'CERTIFICATE':
      return valueForPropertyScopedAssertion('certificate', assertion)
    case 'CONNECTION':
      return valueForPropertyScopedAssertion('connection', assertion)
    case 'JSON_RESPONSE':
      return valueForGeneralAssertion('SslAssertionBuilder', 'jsonResponse', assertion, withProperty)
    case 'TEXT_RESPONSE':
      return valueForGeneralAssertion('SslAssertionBuilder', 'textResponse', assertion, withProperty)
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('SslAssertionBuilder', 'responseTime', assertion)
    default:
      return unsupportedAssertionSource(assertion.source, 'SSL')
  }
}
