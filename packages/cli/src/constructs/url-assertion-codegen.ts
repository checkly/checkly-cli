import { GeneratedFile, Value } from '../sourcegen/index.js'
import { UrlAssertion } from './url-assertion.js'
import { valueForNumericAssertion } from './internal/assertion-codegen.js'

export function valueForUrlAssertion (genfile: GeneratedFile, assertion: UrlAssertion): Value {
  genfile.namedImport('UrlAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'STATUS_CODE':
      return valueForNumericAssertion('UrlAssertionBuilder', 'statusCode', assertion)
    default:
      throw new Error(`Unsupported URL assertion source ${assertion.source}`)
  }
}
