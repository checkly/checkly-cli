import { expr, ident, Value } from '../../sourcegen'
import { Assertion } from './assertion'

export function valueForNumericAssertion<Source extends string> (
  klass: string,
  method: string,
  assertion: Assertion<Source>,
): Value {
  return expr(ident(klass), builder => {
    builder.member(ident(method))
    builder.call(builder => {
      builder.empty()
    })
    switch (assertion.comparison) {
      case 'EQUALS':
        builder.member(ident('equals'))
        builder.call(builder => {
          builder.number(parseInt(assertion.target, 10))
        })
        break
      case 'NOT_EQUALS':
        builder.member(ident('notEquals'))
        builder.call(builder => {
          builder.number(parseInt(assertion.target, 10))
        })
        break
      case 'LESS_THAN':
        builder.member(ident('lessThan'))
        builder.call(builder => {
          builder.number(parseInt(assertion.target, 10))
        })
        break
      case 'GREATER_THAN':
        builder.member(ident('greaterThan'))
        builder.call(builder => {
          builder.number(parseInt(assertion.target, 10))
        })
        break
      default:
        throw new Error(`Unsupported comparison ${assertion.comparison} for assertion source ${assertion.source}`)
    }
  })
}

export function valueForGeneralAssertion<Source extends string> (
  klass: string,
  method: string,
  assertion: Assertion<Source>,
): Value {
  return expr(ident(klass), builder => {
    builder.member(ident(method))
    builder.call(builder => {
      if (assertion.property !== '') {
        builder.string(assertion.property)
      }
    })
    switch (assertion.comparison) {
      case 'EQUALS':
        builder.member(ident('equals'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      case 'NOT_EQUALS':
        builder.member(ident('notEquals'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      case 'HAS_KEY':
        builder.member(ident('hasKey'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      case 'NOT_HAS_KEY':
        builder.member(ident('notHasKey'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      case 'HAS_VALUE':
        builder.member(ident('hasValue'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      case 'NOT_HAS_VALUE':
        builder.member(ident('notHasValue'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      case 'IS_EMPTY':
        builder.member(ident('isEmpty'))
        builder.call(builder => {
          builder.empty()
        })
        break
      case 'NOT_EMPTY':
        builder.member(ident('notEmpty'))
        builder.call(builder => {
          builder.empty()
        })
        break
      case 'LESS_THAN':
        builder.member(ident('lessThan'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      case 'GREATER_THAN':
        builder.member(ident('greaterThan'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      case 'CONTAINS':
        builder.member(ident('contains'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      case 'NOT_CONTAINS':
        builder.member(ident('notContains'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      case 'IS_NULL':
        builder.member(ident('isNull'))
        builder.call(builder => {
          builder.empty()
        })
        break
      case 'NOT_NULL':
        builder.member(ident('isNotNull'))
        builder.call(builder => {
          builder.empty()
        })
        break
      default:
        throw new Error(`Unsupported comparison ${assertion.comparison} for assertion source ${assertion.source}`)
    }
  })
}
