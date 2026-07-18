import { GeneratedFile, Value } from '../sourcegen'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen'
import { DnsAssertion } from './dns-assertion'

export function valueForDnsAssertion (genfile: GeneratedFile, assertion: DnsAssertion): Value {
  genfile.namedImport('DnsAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'RESPONSE_CODE':
      return valueForGeneralAssertion('DnsAssertionBuilder', 'responseCode', assertion, {
        hasProperty: false,
        hasRegex: false,
      })
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('DnsAssertionBuilder', 'responseTime', assertion)
    case 'TEXT_ANSWER':
      return valueForGeneralAssertion('DnsAssertionBuilder', 'textAnswer', assertion, {
        hasProperty: true,
        hasRegex: false,
      })
    case 'JSON_ANSWER':
      return valueForGeneralAssertion('DnsAssertionBuilder', 'jsonAnswer', assertion, {
        hasProperty: true,
        hasRegex: false,
      })
    case 'ANSWER':
      return valueForDnsAnswerAssertion(assertion)
    default:
      throw new Error(`Unsupported DNS assertion source ${assertion.source}`)
  }
}

// The `answer*` builders encode the record property in the method name
// (`answerData`/`answerTtl`/…) and take the quantifier as their argument (all
// but `answerCount`). Reuse the shared general/numeric emitters by carrying the
// quantifier through the `property` slot they already render as the first call
// argument.
const DNS_ANSWER_METHODS: Record<string, { method: string, numeric: boolean }> = {
  data: { method: 'answerData', numeric: false },
  name: { method: 'answerName', numeric: false },
  type: { method: 'answerType', numeric: false },
  ttl: { method: 'answerTtl', numeric: true },
  count: { method: 'answerCount', numeric: true },
}

function valueForDnsAnswerAssertion (assertion: DnsAssertion): Value {
  const mapping = DNS_ANSWER_METHODS[assertion.property]
  if (mapping === undefined) {
    throw new Error(`Unsupported DNS ANSWER assertion property ${assertion.property}`)
  }

  // `count` carries no quantifier; every other property requires one.
  const quantifier = assertion.quantifier ?? ''
  const synthetic = { ...assertion, property: quantifier }

  if (mapping.numeric) {
    return valueForNumericAssertion('DnsAssertionBuilder', mapping.method, synthetic, {
      hasProperty: quantifier !== '',
    })
  }

  return valueForGeneralAssertion('DnsAssertionBuilder', mapping.method, synthetic, {
    hasProperty: quantifier !== '',
    hasRegex: false,
  })
}
