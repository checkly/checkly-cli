import type { TSESTree } from '@typescript-eslint/typescript-estree'

import { hasEscalationPolicy, valueForAlertEscalation } from '../../constructs/alert-escalation-policy-codegen.js'
import { valueForAssertion } from '../../constructs/api-assertion-codegen.js'
import { valueForDnsAssertion } from '../../constructs/dns-assertion-codegen.js'
import { valueForFrequency } from '../../constructs/frequency-codegen.js'
import { valueForGrpcAssertion } from '../../constructs/grpc-assertion-codegen.js'
import { valueForIcmpAssertion } from '../../constructs/icmp-assertion-codegen.js'
import { valueForDate } from '../../constructs/maintenance-window-codegen.js'
import { valueForRetryStrategy } from '../../constructs/retry-strategy-codegen.js'
import { valueForSslAssertion } from '../../constructs/ssl-assertion-codegen.js'
import { valueForTcpAssertion } from '../../constructs/tcp-monitor-codegen.js'
import { valueForTracerouteAssertion } from '../../constructs/traceroute-assertion-codegen.js'
import { valueForUrlAssertion } from '../../constructs/url-assertion-codegen.js'
import {
  ArgumentsValue,
  ArrayValue,
  BooleanValue,
  CallExpressionValue,
  GeneratedFile,
  IdentifierValue,
  MemberExpressionValue,
  NewExpressionValue,
  NullValue,
  NumberValue,
  ObjectValue,
  sortObjectPropertiesByOrderAndName,
  StringValue,
  UndefinedValue,
  Value,
} from '../../sourcegen/index.js'
import { isPlainLiteral, layoutList, type LiteralEdit, memberName, quoteString, renderKey, type SourceStyle } from './literal-edit.js'
import { type Node, WriteBackSkipped } from './source-file.js'

/**
 * Edits of the properties a construct spells with a helper expression rather
 * than a literal: `frequency: Frequency.EVERY_5M`,
 * `retryStrategy: RetryStrategyBuilder.fixedStrategy({ … })`,
 * `alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(…)`,
 * `assertions: [AssertionBuilder.statusCode().equals(200)]`, and a date
 * the account reports as an ISO string: `startsAt: new Date('…')`.
 *
 * The expression is built by the same codegen `checkly import` uses for the
 * property, so the text written is the one an import would have generated;
 * only the rendering differs, following the file's quotes, indentation and
 * line ending the way `renderValue` does for literals (`sourcegen`'s own
 * printer fixes all three). The classes the expression references are
 * looked up under the names the file binds them to, and added to its
 * `checkly/constructs` import when it lacks them (`imports.ts`).
 *
 * An existing value is replaced only when it is a plain literal or an
 * expression on the same helper whose arguments are literals: a variable
 * inside `fixedStrategy({ maxRetries: retries })` is something the user
 * meant, and a rewrite must not throw it away.
 */

export type HelperKind = 'frequency' | 'retryStrategy' | 'alertEscalation' | 'assertions' | 'date'

type AssertionCodegen = (genfile: GeneratedFile, assertion: any) => Value

/** The codegen for each assertion builder a monitor class spells its assertions with. */
const ASSERTION_CODEGENS = {
  AssertionBuilder: valueForAssertion,
  UrlAssertionBuilder: valueForUrlAssertion,
  TcpAssertionBuilder: valueForTcpAssertion,
  DnsAssertionBuilder: valueForDnsAssertion,
  GrpcAssertionBuilder: valueForGrpcAssertion,
  SslAssertionBuilder: valueForSslAssertion,
  IcmpAssertionBuilder: valueForIcmpAssertion,
  TracerouteAssertionBuilder: valueForTracerouteAssertion,
} satisfies Record<string, AssertionCodegen>

export type AssertionBuilderName = keyof typeof ASSERTION_CODEGENS

/** The names of every assertion builder: each spells the same property, so a file may hold any of them. */
export const ASSERTION_BUILDERS: readonly string[] = Object.keys(ASSERTION_CODEGENS)

interface HelperEditBase extends Omit<LiteralEdit, 'helper'> {
  /** Sibling keys of the property that make the edit wrong (`doubleCheck` beside `retryStrategy`). */
  unless?: string[]
  /**
   * A plain value to write instead of the expression when the node being
   * replaced is itself a plain literal: a whole-minute `frequency` stays a
   * number in a file that spells it as one. The choice is made where the
   * node is known, in `apply-edits.ts`; the planner never sees the file.
   */
  literalAlternative?: unknown
}

/**
 * An edit of a helper-spelled property. The class the expression is built
 * on follows from the kind, except for assertions, where each monitor class
 * has its own builder.
 */
export type HelperEdit = HelperEditBase & (
  | { helper: 'frequency' | 'retryStrategy' | 'alertEscalation' | 'date', builder?: undefined }
  | { helper: 'assertions', builder: AssertionBuilderName }
)

export type SourceEdit = LiteralEdit | HelperEdit

export function isHelperEdit (edit: SourceEdit): edit is HelperEdit {
  return edit.helper !== undefined
}

const HELPER_CLASSES: Readonly<Record<Exclude<HelperKind, 'assertions'>, string>> = {
  frequency: 'Frequency',
  retryStrategy: 'RetryStrategyBuilder',
  alertEscalation: 'AlertEscalationBuilder',
  date: 'Date',
}

/** The class the edit's expression is built on, as `checkly/constructs` exports it, or the global `Date`. */
export function helperClass (edit: HelperEdit): string {
  return edit.helper === 'assertions' ? edit.builder : HELPER_CLASSES[edit.helper]
}

/** Whether the edit's class is a global every file binds, rather than one imported from `checkly/constructs`. */
export function isGlobalHelper (edit: HelperEdit): boolean {
  return edit.helper === 'date'
}

/**
 * A `GeneratedFile` that only remembers which names the codegen asked to
 * import. The names are added to the file's `checkly/constructs` import, so
 * a codegen asking for anything else cannot be written.
 */
class ImportSink extends GeneratedFile {
  readonly names: string[] = []

  constructor () {
    super('write-back.ts')
  }

  namedImport (identifier: string, from: string, options?: Parameters<GeneratedFile['namedImport']>[2]): void {
    if (from !== 'checkly/constructs' || options?.alias !== undefined) {
      throw new WriteBackSkipped(`${identifier} is not a class checkly/constructs exports`)
    }
    if (!this.names.includes(identifier)) {
      this.names.push(identifier)
    }
    super.namedImport(identifier, from, options)
  }
}

/** The errors of a `cause` chain, outermost first: the codegen wraps each failure in another. */
function causes (err: unknown): unknown[] {
  const chain: unknown[] = []
  for (let current = err; current !== undefined; current = current instanceof Error ? current.cause : undefined) {
    chain.push(current)
  }
  return chain
}

/** The classes an expression references: the identifiers its member and call chains are rooted at. */
function referencedClasses (value: Value, names: Set<string> = new Set()): Set<string> {
  if (value instanceof IdentifierValue) {
    names.add(value.value)
  } else if (value instanceof MemberExpressionValue) {
    referencedClasses(value.object, names)
  } else if (value instanceof CallExpressionValue || value instanceof NewExpressionValue) {
    referencedClasses(value.callee, names)
    referencedClasses(value.args, names)
  } else if (value instanceof ArgumentsValue || value instanceof ArrayValue) {
    value.value.forEach(member => referencedClasses(member, names))
  } else if (value instanceof ObjectValue) {
    value.value.forEach(property => referencedClasses(property.value, names))
  }
  return names
}

/**
 * The expression the codegen builds for the edit's value, and the classes
 * it references (those the codegen asked to import and the expression
 * names: a gRPC assertion the builder cannot spell comes back as a plain
 * object, which needs no import). The value is what the account holds, in
 * the import format `entry.before` carries.
 *
 * @throws WriteBackSkipped for a value the codegen cannot spell (an
 * assertion source or retry type this CLI does not know, a malformed row)
 * or one that means "unset", which is never written because nothing is
 * ever removed from the code.
 */
export function buildHelperValue (edit: HelperEdit): { value: Value, imports: string[] } {
  const at = edit.path.join('.')
  const missing = () => new WriteBackSkipped(`Checkly has no value for ${at}; edit the property by hand`)
  const sink = new ImportSink()
  let value: Value
  try {
    switch (edit.helper) {
      case 'frequency': {
        const schedule = typeof edit.value === 'number'
          ? { frequency: edit.value }
          : edit.value as { frequency?: unknown, frequencyOffset?: unknown } | null | undefined
        if (typeof schedule?.frequency !== 'number') {
          throw missing()
        }
        value = valueForFrequency(sink, {
          frequency: schedule.frequency,
          frequencyOffset: typeof schedule.frequencyOffset === 'number' ? schedule.frequencyOffset : undefined,
        })
        break
      }
      case 'retryStrategy': {
        // A row holds null for no retries; anything else is a strategy of a type.
        const strategy = edit.value as { type?: unknown } | null | undefined
        if (strategy !== null && typeof strategy?.type !== 'string') {
          throw missing()
        }
        value = valueForRetryStrategy(sink, strategy as Parameters<typeof valueForRetryStrategy>[1])
        break
      }
      case 'alertEscalation':
        // A v2 group on the global policy spells it as the word 'global';
        // the column holds `{}` for a check that never set a policy of its own.
        if (edit.value === 'global') {
          value = new StringValue('global')
          break
        }
        if (!hasEscalationPolicy(edit.value)) {
          throw missing()
        }
        value = valueForAlertEscalation(sink, edit.value)
        break
      case 'date': {
        // The account reports a timestamp as an ISO string; the construct
        // takes a Date, which the import spells as `new Date('<iso>')`.
        if (typeof edit.value !== 'string' || Number.isNaN(Date.parse(edit.value))) {
          throw missing()
        }
        value = valueForDate(edit.value)
        break
      }
      case 'assertions': {
        const codegen: AssertionCodegen | undefined = ASSERTION_CODEGENS[edit.builder]
        if (codegen === undefined) {
          throw new WriteBackSkipped(`${edit.builder} is not an assertion builder this tool knows`)
        }
        if (!Array.isArray(edit.value) || !edit.value.every(isRecord)) {
          throw missing()
        }
        value = new ArrayValue(edit.value.map(assertion => codegen(sink, assertion)))
        break
      }
    }
  } catch (err) {
    const chain = causes(err)
    const skipped = chain.find(cause => cause instanceof WriteBackSkipped)
    if (skipped !== undefined) {
      throw skipped
    }
    // The codegens refuse what they cannot spell with a plain `Error`
    // (`Unsupported …`, `… cannot be null`), wrapped by the builders; a
    // `TypeError` or the like is a defect of this CLI and stays one.
    const cause = chain[chain.length - 1]
    if (cause instanceof Error && cause.constructor === Error) {
      throw new WriteBackSkipped(`Checkly reported a value this CLI cannot spell: ${cause.message}`)
    }
    throw err
  }
  const referenced = referencedClasses(value)
  return { value, imports: sink.names.filter(name => referenced.has(name)) }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Whether `node` is an expression built on one of `locals` (the names the
 * file binds the helper class to): a member, call or `new` chain rooted at
 * such a name, with every argument a literal (see `isReplaceableByHelper`),
 * `undefined`, or such a chain. Replacing it loses nothing the user wrote
 * by hand.
 */
export function isHelperExpression (node: Node, locals: ReadonlySet<string>): boolean {
  const argument = (arg: Node): boolean =>
    arg.type !== 'SpreadElement'
    && ((arg.type === 'Identifier' && arg.name === 'undefined') || isReplaceableByHelper(arg, locals))
  switch (node.type) {
    case 'Identifier':
      return locals.has(node.name)
    case 'MemberExpression':
      return !node.computed && node.property.type === 'Identifier' && isHelperExpression(node.object, locals)
    case 'CallExpression':
    case 'NewExpression':
      return isHelperExpression(node.callee, locals) && node.arguments.every(argument)
    default:
      return false
  }
}

/**
 * Whether `node` can be replaced by a helper edit without losing anything
 * written by hand: a plain literal, `null` (the edit writes an expression,
 * not null, and the codegen spells an assertion it has no builder method
 * for as an object holding `regex: null`), a helper expression, or an
 * array or object built only of those.
 */
export function isReplaceableByHelper (node: Node, locals: ReadonlySet<string>): boolean {
  if (isPlainLiteral(node) || isHelperExpression(node, locals) || (node.type === 'Literal' && node.value === null)) {
    return true
  }
  if (node.type === 'ArrayExpression') {
    return node.elements.every(element =>
      element !== null && element.type !== 'SpreadElement' && isReplaceableByHelper(element, locals))
  }
  if (node.type === 'ObjectExpression') {
    return node.properties.every(property =>
      memberName(property) !== undefined
      && !(property as TSESTree.Property).shorthand
      && isReplaceableByHelper((property as TSESTree.Property).value, locals))
  }
  return false
}

export interface ExpressionLayout {
  /** The indentation of the line the expression starts on. */
  column: string
  /** Whether objects and lists inside stay on one line, as the replaced node did. */
  inline: boolean
  /** Whether a multi-line object or list ends its last member with a comma. */
  trailingComma: boolean
  /** The local name of each class the expression references, where the file binds it under another. */
  locals: ReadonlyMap<string, string>
}

/**
 * The source text of a sourcegen expression in the file's style. Objects
 * keep the order the codegen gave them (its own sorter), so the text is
 * the one `checkly import` would print, reindented and requoted.
 *
 * @throws WriteBackSkipped for a value class the codegen never produces for
 * these properties and this renderer does not spell.
 */
export function renderExpression (value: Value, style: SourceStyle, layout: ExpressionLayout): string {
  const inner = layout.column + style.indentUnit
  const nested = (member: Value) => renderExpression(member, style, { ...layout, column: inner })
  if (value instanceof IdentifierValue) {
    return layout.locals.get(value.value) ?? value.value
  }
  if (value instanceof MemberExpressionValue) {
    return `${renderExpression(value.object, style, layout)}.${renderExpression(value.property, style, layout)}`
  }
  if (value instanceof CallExpressionValue) {
    return `${renderExpression(value.callee, style, layout)}${renderExpression(value.args, style, layout)}`
  }
  if (value instanceof NewExpressionValue) {
    return `new ${renderExpression(value.callee, style, layout)}${renderExpression(value.args, style, layout)}`
  }
  if (value instanceof ArgumentsValue) {
    return `(${value.value.map(arg => renderExpression(arg, style, layout)).join(', ')})`
  }
  if (value instanceof StringValue) {
    return quoteString(value.value, style.quote)
  }
  if (value instanceof NumberValue) {
    if (!Number.isFinite(value.value)) {
      throw new WriteBackSkipped(`${value.value} cannot be written as a literal`)
    }
    return String(value.value)
  }
  if (value instanceof BooleanValue) {
    return String(value.value)
  }
  if (value instanceof UndefinedValue) {
    return 'undefined'
  }
  if (value instanceof NullValue) {
    return 'null'
  }
  if (value instanceof ArrayValue) {
    return layoutList('[', value.value.map(nested), ']', style, layout)
  }
  if (value instanceof ObjectValue) {
    const sorter = value.options?.sort ?? sortObjectPropertiesByOrderAndName
    const members = [...value.value].sort(sorter)
      .map(property => `${renderKey(property.name, style.quote)}: ${nested(property.value)}`)
    return layoutList('{', members, '}', style, layout)
  }
  throw new WriteBackSkipped(`a ${value.constructor.name} cannot be written into the code`)
}

/**
 * Whether a parsed node is the expression `value` renders to: the same
 * names, members, arguments and literals. The check the read-back of a
 * written file makes; it says nothing about what the expression means,
 * which the codegen's own tests cover.
 */
export function matchesValue (node: Node, value: Value, locals: ReadonlyMap<string, string>): boolean {
  const all = <T extends Value> (nodes: readonly (Node | null)[], values: readonly T[]): boolean =>
    nodes.length === values.length
    && nodes.every((child, i) => child !== null && matchesValue(child, values[i], locals))
  if (value instanceof IdentifierValue) {
    return node.type === 'Identifier' && node.name === (locals.get(value.value) ?? value.value)
  }
  if (value instanceof MemberExpressionValue) {
    return node.type === 'MemberExpression' && !node.computed
      && matchesValue(node.object, value.object, locals) && matchesValue(node.property, value.property, locals)
  }
  if (value instanceof CallExpressionValue) {
    return node.type === 'CallExpression' && matchesValue(node.callee, value.callee, locals)
      && all(node.arguments, value.args.value)
  }
  if (value instanceof NewExpressionValue) {
    return node.type === 'NewExpression' && matchesValue(node.callee, value.callee, locals)
      && all(node.arguments, value.args.value)
  }
  if (value instanceof StringValue) {
    return node.type === 'Literal' && node.value === value.value
  }
  if (value instanceof NumberValue) {
    if (value.value < 0) {
      return node.type === 'UnaryExpression' && node.operator === '-'
        && node.argument.type === 'Literal' && node.argument.value === -value.value
    }
    return node.type === 'Literal' && node.value === value.value
  }
  if (value instanceof BooleanValue) {
    return node.type === 'Literal' && node.value === value.value
  }
  if (value instanceof UndefinedValue) {
    return node.type === 'Identifier' && node.name === 'undefined'
  }
  if (value instanceof NullValue) {
    return node.type === 'Literal' && node.value === null
  }
  if (value instanceof ArrayValue) {
    return node.type === 'ArrayExpression' && all(node.elements, value.value)
  }
  if (value instanceof ObjectValue) {
    if (node.type !== 'ObjectExpression' || node.properties.length !== value.value.length) {
      return false
    }
    return value.value.every(property => {
      const member = node.properties.find(candidate => memberName(candidate) === property.name) as
        TSESTree.Property | undefined
      return member !== undefined && !member.shorthand && matchesValue(member.value, property.value, locals)
    })
  }
  return false
}
