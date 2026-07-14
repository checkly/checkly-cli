import { GeneratedFile, Value } from '../sourcegen/index.js'
import {
  unsupportedAssertionSource,
  valueForGeneralAssertion,
  valueForNumericAssertion,
} from './internal/assertion-codegen.js'
import { SslAssertion } from './ssl-assertion.js'

// CERTIFICATE / CONNECTION / JSON_RESPONSE address a value by property name and carry
// no regex, so the property slot is emitted and the regex slot suppressed.
const withProperty = { hasProperty: true, hasRegex: false }
// TEXT_RESPONSE carries a regex and no property.
const withRegex = { hasProperty: false, hasRegex: true }

export function valueForSslAssertion (genfile: GeneratedFile, assertion: SslAssertion): Value {
  genfile.namedImport('SslAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'CERTIFICATE':
      return valueForGeneralAssertion('SslAssertionBuilder', 'certificate', assertion, withProperty)
    case 'CONNECTION':
      return valueForGeneralAssertion('SslAssertionBuilder', 'connection', assertion, withProperty)
    case 'JSON_RESPONSE':
      return valueForGeneralAssertion('SslAssertionBuilder', 'jsonResponse', assertion, withProperty)
    case 'TEXT_RESPONSE':
      return valueForGeneralAssertion('SslAssertionBuilder', 'textResponse', assertion, withRegex)
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('SslAssertionBuilder', 'responseTime', assertion)
    default:
      return unsupportedAssertionSource(assertion.source, 'SSL')
  }
}
