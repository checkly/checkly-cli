export interface Assertion<Source extends string> {
  source: Source
  property: string
  comparison: string
  target: string
  regex: string | null
}

// Builds an assertion payload from its parts. `comparison` is a free type parameter
// so any operator string (including SSL's `MATCHES`) is accepted without a central
// union. Empty property, stringified target, and null regex are the wire defaults.
export function toAssertion<
  Source extends string,
  Comparison extends string,
  Target extends string | number | boolean = string,
> (
  source: Source,
  comparison: Comparison,
  target?: Target,
  property?: string,
  regex?: string | null,
): Assertion<Source> {
  return {
    source,
    comparison,
    property: property ?? '',
    target: target?.toString() ?? '',
    regex: regex ?? null,
  }
}

export class NumericAssertionBuilder<Source extends string, Property extends string = string> {
  source: Source
  property?: Property

  constructor (source: Source, property?: Property) {
    this.source = source
    this.property = property
  }

  equals (target: number): Assertion<Source> {
    return toAssertion(this.source, 'EQUALS', target, this.property)
  }

  notEquals (target: number): Assertion<Source> {
    return toAssertion(this.source, 'NOT_EQUALS', target, this.property)
  }

  lessThan (target: number): Assertion<Source> {
    return toAssertion(this.source, 'LESS_THAN', target, this.property)
  }

  greaterThan (target: number): Assertion<Source> {
    return toAssertion(this.source, 'GREATER_THAN', target, this.property)
  }
}

/**
 * General assertion builder supporting string / number / boolean targets.
 *
 * The optional `TargetType` parameter narrows the value-comparison methods
 * (`equals`, `notEquals`, `lessThan`, `greaterThan`)
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
    return toAssertion(this.source, 'EQUALS', target, this.property, this.regex)
  }

  notEquals (target: TargetType): Assertion<Source> {
    return toAssertion(this.source, 'NOT_EQUALS', target, this.property, this.regex)
  }

  hasKey (target: string): Assertion<Source> {
    return toAssertion(this.source, 'HAS_KEY', target, this.property, this.regex)
  }

  notHasKey (target: string): Assertion<Source> {
    return toAssertion(this.source, 'NOT_HAS_KEY', target, this.property, this.regex)
  }

  hasValue (target: TargetType): Assertion<Source> {
    return toAssertion(this.source, 'HAS_VALUE', target, this.property, this.regex)
  }

  notHasValue (target: TargetType): Assertion<Source> {
    return toAssertion(this.source, 'NOT_HAS_VALUE', target, this.property, this.regex)
  }

  isEmpty () {
    return toAssertion(this.source, 'IS_EMPTY', undefined, this.property, this.regex)
  }

  notEmpty () {
    return toAssertion(this.source, 'NOT_EMPTY', undefined, this.property, this.regex)
  }

  lessThan (target: TargetType): Assertion<Source> {
    return toAssertion(this.source, 'LESS_THAN', target, this.property, this.regex)
  }

  greaterThan (target: TargetType): Assertion<Source> {
    return toAssertion(this.source, 'GREATER_THAN', target, this.property, this.regex)
  }

  contains (target: string): Assertion<Source> {
    return toAssertion(this.source, 'CONTAINS', target, this.property, this.regex)
  }

  notContains (target: string): Assertion<Source> {
    return toAssertion(this.source, 'NOT_CONTAINS', target, this.property, this.regex)
  }

  isNull () {
    return toAssertion(this.source, 'IS_NULL', undefined, this.property, this.regex)
  }

  isNotNull () {
    return toAssertion(this.source, 'NOT_NULL', undefined, this.property, this.regex)
  }
}
