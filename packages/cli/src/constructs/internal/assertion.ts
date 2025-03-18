import { expr, ident, Value } from '../../sourcegen'

type Comparison =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'HAS_KEY'
  | 'NOT_HAS_KEY'
  | 'HAS_VALUE'
  | 'NOT_HAS_VALUE'
  | 'IS_EMPTY'
  | 'NOT_EMPTY'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'IS_NULL'
  | 'NOT_NULL'

export interface Assertion<Source extends string> {
  source: Source
  property: string
  comparison: string
  target: string
  regex: string|null
}

export class NumericAssertionBuilder<Source extends string> {
  source: Source

  constructor (source: Source) {
    this.source = source
  }

  equals (target: number): Assertion<Source> {
    return this._toAssertion('EQUALS', target)
  }

  notEquals (target: number): Assertion<Source> {
    return this._toAssertion('NOT_EQUALS', target)
  }

  lessThan (target: number): Assertion<Source> {
    return this._toAssertion('LESS_THAN', target)
  }

  greaterThan (target: number): Assertion<Source> {
    return this._toAssertion('GREATER_THAN', target)
  }

  /** @private */
  private _toAssertion (comparison: Comparison, target: number): Assertion<Source> {
    return {
      source: this.source,
      comparison,
      property: '',
      target: target.toString(),
      regex: null,
    }
  }
}

export function sourceForNumericAssertion<Source extends string> (
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

export class GeneralAssertionBuilder<Source extends string> {
  source: Source
  property?: string
  regex?: string

  constructor (source: Source, property?: string, regex?: string) {
    this.source = source
    this.property = property
    this.regex = regex
  }

  equals (target: string|number|boolean): Assertion<Source> {
    return this._toAssertion('EQUALS', target)
  }

  notEquals (target: string|number|boolean): Assertion<Source> {
    return this._toAssertion('NOT_EQUALS', target)
  }

  hasKey (target: string): Assertion<Source> {
    return this._toAssertion('HAS_KEY', target)
  }

  notHasKey (target: string): Assertion<Source> {
    return this._toAssertion('NOT_HAS_KEY', target)
  }

  hasValue (target: string|number|boolean): Assertion<Source> {
    return this._toAssertion('HAS_VALUE', target)
  }

  notHasValue (target: string|number|boolean): Assertion<Source> {
    return this._toAssertion('NOT_HAS_VALUE', target)
  }

  isEmpty () {
    return this._toAssertion('IS_EMPTY')
  }

  notEmpty () {
    return this._toAssertion('NOT_EMPTY')
  }

  lessThan (target: string|number|boolean): Assertion<Source> {
    return this._toAssertion('LESS_THAN', target)
  }

  greaterThan (target: string|number|boolean): Assertion<Source> {
    return this._toAssertion('GREATER_THAN', target)
  }

  contains (target: string): Assertion<Source> {
    return this._toAssertion('CONTAINS', target)
  }

  notContains (target: string): Assertion<Source> {
    return this._toAssertion('NOT_CONTAINS', target)
  }

  isNull () {
    return this._toAssertion('IS_NULL')
  }

  isNotNull () {
    return this._toAssertion('NOT_NULL')
  }

  /** @private */
  private _toAssertion (comparison: Comparison, target?: string|number|boolean): Assertion<Source> {
    return {
      source: this.source,
      comparison,
      property: this.property ?? '',
      target: target?.toString() ?? '',
      regex: this.regex ?? null,
    }
  }
}

export function sourceForGeneralAssertion<Source extends string> (
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
