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
  regex: string | null
}

export class NumericAssertionBuilder<Source extends string, Property extends string = string> {
  source: Source
  property?: Property

  constructor (source: Source, property?: Property) {
    this.source = source
    this.property = property
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
      property: this.property ?? '',
      target: target.toString(),
      regex: null,
    }
  }
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

  equals (target: string | number | boolean): Assertion<Source> {
    return this._toAssertion('EQUALS', target)
  }

  notEquals (target: string | number | boolean): Assertion<Source> {
    return this._toAssertion('NOT_EQUALS', target)
  }

  hasKey (target: string): Assertion<Source> {
    return this._toAssertion('HAS_KEY', target)
  }

  notHasKey (target: string): Assertion<Source> {
    return this._toAssertion('NOT_HAS_KEY', target)
  }

  hasValue (target: string | number | boolean): Assertion<Source> {
    return this._toAssertion('HAS_VALUE', target)
  }

  notHasValue (target: string | number | boolean): Assertion<Source> {
    return this._toAssertion('NOT_HAS_VALUE', target)
  }

  isEmpty () {
    return this._toAssertion('IS_EMPTY')
  }

  notEmpty () {
    return this._toAssertion('NOT_EMPTY')
  }

  lessThan (target: string | number | boolean): Assertion<Source> {
    return this._toAssertion('LESS_THAN', target)
  }

  greaterThan (target: string | number | boolean): Assertion<Source> {
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
  private _toAssertion (comparison: Comparison, target?: string | number | boolean): Assertion<Source> {
    return {
      source: this.source,
      comparison,
      property: this.property ?? '',
      target: target?.toString() ?? '',
      regex: this.regex ?? null,
    }
  }
}
