import { GeneratedFile, Value } from '../sourcegen/index.js'
import { UrlAssertion } from './url-assertion.js'
import { unsupportedAssertionSource, valueForNumericAssertion } from './internal/assertion-codegen.js'

export function valueForUrlAssertion (genfile: GeneratedFile, assertion: UrlAssertion): Value {
  genfile.namedImport('UrlAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'STATUS_CODE':
      return valueForNumericAssertion('UrlAssertionBuilder', 'statusCode', assertion)
    default:
      return unsupportedAssertionSource(assertion.source, 'URL')
  }
}
