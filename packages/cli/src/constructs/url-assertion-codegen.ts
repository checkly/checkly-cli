import { GeneratedFile, Value } from '../sourcegen'
import { UrlAssertion } from './url-assertion'
import { valueForNumericAssertion } from './internal/assertion-codegen'

export function valueForUrlAssertion (genfile: GeneratedFile, assertion: UrlAssertion): Value {
  genfile.namedImport('UrlAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'STATUS_CODE':
      return valueForNumericAssertion('UrlAssertionBuilder', 'statusCode', assertion)
    default:
      throw new Error(`Unsupported URL assertion source ${assertion.source}`)
  }
}
