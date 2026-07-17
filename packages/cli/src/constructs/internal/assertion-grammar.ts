import { Assertion, GeneralAssertionBuilder, toAssertion } from './assertion.js'

// A property-scoped assertion grammar: one declaration per property states the operators
// it exposes and the type of its target. The builder surface, the validation whitelist,
// and codegen's literal kind are all derived from it, so a property's grammar lives in one
// place instead of being restated in a builder class, a value-type table, and a whitelist.
//
// This module is monitor-agnostic; each monitor supplies its own grammar tables.

// The operator catalog: builder method name -> wire comparison. Shared by every monitor
// grammar; adding an operator is one line here plus listing it on the properties that
// accept it.
export const operatorComparisons = {
  equals: 'EQUALS',
  notEquals: 'NOT_EQUALS',
  greaterThan: 'GREATER_THAN',
  lessThan: 'LESS_THAN',
  contains: 'CONTAINS',
  notContains: 'NOT_CONTAINS',
} as const

export type OperatorName = keyof typeof operatorComparisons

// How a target value is written on the wire. Drives validation's target-value check and
// codegen's choice of a bare literal versus a quoted string.
export type TargetValueType = 'number' | 'boolean' | 'string'

// A target spec carries the runtime value kind and, through a phantom type parameter, the
// compile-time target type. The symbol member is optional and never assigned, so a spec is
// just `{ kind }` at runtime.
//
// The grammar constraint below uses the phantom-free supertype `AnyTargetSpec`, never
// `TargetSpec<any>`: a `TargetSpec<any>` constraint would contextually type a bare
// `stringTarget()` call, and contextual inference (`T = any`) would beat the `= string`
// default — silently widening a plain-string property's target to `any`. With no phantom
// member in the constraint there is no inference candidate, so the default holds.
declare const targetType: unique symbol

export interface AnyTargetSpec {
  readonly kind: TargetValueType
}

export interface TargetSpec<T extends string | number | boolean> extends AnyTargetSpec {
  readonly [targetType]?: T
}

export function numberTarget (): TargetSpec<number> {
  return { kind: 'number' }
}

export function booleanTarget (): TargetSpec<boolean> {
  return { kind: 'boolean' }
}

export function stringTarget<T extends string = string> (): TargetSpec<T> {
  return { kind: 'string' }
}

export interface PropertyGrammar {
  readonly operators: readonly OperatorName[]
  readonly target: AnyTargetSpec
}

// `const G` keeps each row's operator array a literal tuple without callers writing
// `as const`, so `keyof typeof grammar` and the per-property operator sets stay precise.
export function defineGrammar<const G extends Record<string, PropertyGrammar>> (grammar: G): G {
  return grammar
}

type TargetOf<Spec> = Spec extends TargetSpec<infer T> ? T : never

// The builder surface for one property: each declared operator becomes a method taking the
// property's target type. Distributing over a union `Decl` means a builder created from a
// union property exposes only the operators common to every arm.
export type PropertyOperators<Source extends string, Decl extends PropertyGrammar> =
  Decl extends PropertyGrammar
    ? { [Op in Decl['operators'][number]]: (target: TargetOf<Decl['target']>) => Assertion<Source> }
    : never

// Builds the operator object for a known property by looping over its declared operators.
// The cast is the one unavoidable bridge in the design: TypeScript cannot connect a runtime
// loop to a mapped type. It is sound because the loop defines exactly the keys in
// `decl.operators`, each routed through `operatorComparisons` — the same data
// `PropertyOperators` is computed from.
function makeOperators<Source extends string, Decl extends PropertyGrammar> (
  source: Source,
  property: string,
  decl: Decl,
): PropertyOperators<Source, Decl> {
  const operators: Record<string, (target: string | number | boolean) => Assertion<Source>> = {}
  for (const operator of decl.operators) {
    operators[operator] = target => toAssertion(source, operatorComparisons[operator], target, property)
  }
  return operators as PropertyOperators<Source, Decl>
}

// Resolves the operators for a property of a grammar.
//
// The typed signature makes an unknown property a compile error, but plain JavaScript
// callers and object-literal assertions still reach this at runtime with an arbitrary
// string. Those fall back to an unconstrained builder so the call returns something usable;
// the property is then reported by the monitor's validation at deploy time rather than
// throwing here.
export function operatorsForProperty<
  Source extends string,
  Grammar extends Record<string, PropertyGrammar>,
  Property extends keyof Grammar & string,
> (
  grammar: Grammar,
  source: Source,
  property: Property,
): PropertyOperators<Source, Grammar[Property]> {
  if (!Object.hasOwn(grammar, property)) {
    const fallback = new GeneralAssertionBuilder<Source>(source, property)
    return fallback as unknown as PropertyOperators<Source, Grammar[Property]>
  }
  return makeOperators(source, property, grammar[property])
}

// Resolves the operators for a source-scoped grammar — a single declaration with no
// property, for sources whose value is the source itself (e.g. traceroute HOP_COUNT). The
// property slot is emitted empty, matching the wire shape those sources carry.
export function operatorsForSource<Source extends string, Decl extends PropertyGrammar> (
  source: Source,
  decl: Decl,
): PropertyOperators<Source, Decl> {
  return makeOperators(source, '', decl)
}

// Runtime derivations shared by validation and codegen, so both read the same grammar the
// builder is generated from.

// The wire comparisons a property accepts, from its declared operators.
export function comparisonsForGrammar (decl: PropertyGrammar): Record<string, true> {
  return Object.fromEntries(decl.operators.map(operator => [operatorComparisons[operator], true]))
}

// How a property's target is written on the wire.
export function valueTypeForGrammar (decl: PropertyGrammar): TargetValueType {
  return decl.target.kind
}
