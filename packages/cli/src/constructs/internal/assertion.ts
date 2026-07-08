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
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'MATCHES'
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

  greaterThanOrEqual (target: number): Assertion<Source> {
    return this._toAssertion('GREATER_THAN_OR_EQUAL', target)
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

/**
 * General assertion builder supporting string / number / boolean targets.
 *
 * The optional `TargetType` parameter narrows the value-comparison methods
 * (`equals`, `notEquals`, `lessThan`, `greaterThan`, `greaterThanOrEqual`)
 * to a specific set of values — e.g. `TlsVersionValue` for TLS version
 * assertions. When omitted it defaults to `string | number | boolean`,
 * preserving full backward compatibility.
 */
export class GeneralAssertionBuilder<
  Source extends string,
  TargetType extends string | number | boolean = string | number | boolean,
> {
  source: Source
  property?: string
  regex?: string

  constructor (source: Source, property?: string, regex?: string) {
    this.source = source
    this.property = property
    this.regex = regex
  }

  equals (target: TargetType): Assertion<Source> {
    return this._toAssertion('EQUALS', target)
  }

  notEquals (target: TargetType): Assertion<Source> {
    return this._toAssertion('NOT_EQUALS', target)
  }

  hasKey (target: string): Assertion<Source> {
    return this._toAssertion('HAS_KEY', target)
  }

  notHasKey (target: string): Assertion<Source> {
    return this._toAssertion('NOT_HAS_KEY', target)
  }

  hasValue (target: TargetType): Assertion<Source> {
    return this._toAssertion('HAS_VALUE', target)
  }

  notHasValue (target: TargetType): Assertion<Source> {
    return this._toAssertion('NOT_HAS_VALUE', target)
  }

  isEmpty () {
    return this._toAssertion('IS_EMPTY')
  }

  notEmpty () {
    return this._toAssertion('NOT_EMPTY')
  }

  lessThan (target: TargetType): Assertion<Source> {
    return this._toAssertion('LESS_THAN', target)
  }

  greaterThan (target: TargetType): Assertion<Source> {
    return this._toAssertion('GREATER_THAN', target)
  }

  greaterThanOrEqual (target: TargetType): Assertion<Source> {
    return this._toAssertion('GREATER_THAN_OR_EQUAL', target)
  }

  contains (target: string): Assertion<Source> {
    return this._toAssertion('CONTAINS', target)
  }

  notContains (target: string): Assertion<Source> {
    return this._toAssertion('NOT_CONTAINS', target)
  }

  matches (regex: string): Assertion<Source> {
    // MATCHES carries the regular expression in the `target` field (the runner
    // compiles `target` as the pattern), mirroring EQUALS/CONTAINS.
    return this._toAssertion('MATCHES', regex)
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
