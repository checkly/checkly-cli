import { expr, ident, Value } from '../../sourcegen/index.js'
import { Assertion } from './assertion.js'

/**
 * Rejects an assertion source that has no codegen case.
 *
 * The `never` parameter makes an unhandled source a compile-time error: adding a
 * member to a monitor's assertion source union without adding the matching codegen
 * case fails to typecheck. The runtime throw remains because wire data may carry a
 * source this version of the CLI does not know about.
 */
export function unsupportedAssertionSource (source: never, kind?: string): never {
  const prefix = kind === undefined ? 'Unsupported' : `Unsupported ${kind}`
  throw new Error(`${prefix} assertion source ${String(source)}`)
}

export interface ValueForNumericAssertionOptions {
  hasProperty?: boolean
}

export function valueForNumericAssertion<Source extends string> (
  klass: string,
  method: string,
  assertion: Assertion<Source>,
  options?: ValueForNumericAssertionOptions,
): Value {
  return expr(ident(klass), builder => {
    builder.member(ident(method))
    builder.call(builder => {
      const hasProperty = options?.hasProperty ?? false
      if (hasProperty && assertion.property !== '') {
        builder.string(assertion.property)
      }
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

// Emits an SSL boolean-source assertion: `Builder.method().equals(true|false)`.
// The four boolean SSL sources only support EQUALS and carry no property/regex.
export function valueForBooleanAssertion<Source extends string> (
  klass: string,
  method: string,
  assertion: Assertion<Source>,
): Value {
  return expr(ident(klass), builder => {
    builder.member(ident(method))
    builder.call(() => {})
    switch (assertion.comparison) {
      case 'EQUALS':
        builder.member(ident('equals'))
        builder.call(builder => {
          builder.boolean(assertion.target === 'true')
        })
        break
      default:
        throw new Error(`Unsupported comparison ${assertion.comparison} for assertion source ${assertion.source}`)
    }
  })
}

export interface ValueForGeneralAssertionOptions {
  hasProperty?: boolean
  hasRegex?: boolean
  // When set, a `MATCHES` comparison emits `.matches(target)`. Only the SSL string
  // sources (CIPHER_SUITE/ISSUER_CN/SIGNATURE_ALGORITHM) accept MATCHES; every other
  // caller leaves it off, so MATCHES stays a `default: throw` for them.
  hasMatches?: boolean
}

export function valueForGeneralAssertion<Source extends string> (
  klass: string,
  method: string,
  assertion: Assertion<Source>,
  options?: ValueForGeneralAssertionOptions,
): Value {
  return expr(ident(klass), builder => {
    builder.member(ident(method))
    builder.call(builder => {
      const hasProperty = options?.hasProperty ?? true
      if (hasProperty && assertion.property !== '') {
        builder.string(assertion.property)
      }

      const hasRegex = options?.hasRegex ?? true
      if (hasRegex && assertion.regex !== '' && assertion.regex !== null) {
        builder.string(assertion.regex)
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
      case 'MATCHES':
        if (!options?.hasMatches) {
          throw new Error(`Unsupported comparison ${assertion.comparison} for assertion source ${assertion.source}`)
        }
        builder.member(ident('matches'))
        builder.call(builder => {
          builder.string(assertion.target)
        })
        break
      default:
        throw new Error(`Unsupported comparison ${assertion.comparison} for assertion source ${assertion.source}`)
    }
  })
}
