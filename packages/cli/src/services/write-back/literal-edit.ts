import type { TSESTree } from '@typescript-eslint/typescript-estree'
import type { Value } from '../../sourcegen/index.js'
import {
  appendAfterLast,
  type Node,
  type ParsedSource,
  type SourceToken,
  type Splice,
  tokensBetween,
  WriteBackSkipped,
  walk,
} from './source-file.js'

/**
 * Literal edits of the options object of a construct call: where a path
 * (`['request', 'url']`) lands in the object, what may be replaced there,
 * and how a plain value is rendered in the file's own style.
 *
 * A position that exists and holds a plain literal may be replaced; a key
 * the innermost object lacks is inserted after the object's last member;
 * anything else — a variable, a spread, a missing parent — is refused,
 * because a rewrite that guesses what the code means is worse than none.
 * A value the construct spells with a helper (`Frequency.EVERY_5M`,
 * `RetryStrategyBuilder.fixedStrategy({ … })`) is `helper-edit.ts`'s job;
 * `apply-edits.ts` splices both kinds into the text, and `imports.ts` adds
 * the helper classes to the file's import.
 *
 * Rendering copies what surrounds the value: the quote character the object
 * already uses, its indentation unit, whether it ends members with a
 * trailing comma, and the file's line ending. Commas and comments are
 * located through the parser's tokens, so a comma or a line break inside a
 * comment cannot mislead a splice. (`src/sourcegen` renders construct
 * source too, but it orders keys and fixes the style, which is what a
 * splice into a user's file must not do.)
 */

export interface LiteralEdit {
  /** Property path inside the options object; a numeric segment indexes an array. */
  path: string[]
  /** The value to write. `null` and `undefined` are refused (see `renderValue`). */
  value: unknown
  /** Absent on a literal edit; a `HelperEdit` (`helper-edit.ts`) sets it. */
  helper?: undefined
}

export interface AppliedEdit extends LiteralEdit {
  /** The source text the edit replaced, or undefined when the property was added. */
  previous?: string
  /** The text written for the value. */
  rendered: string
  /** Whether the text is a plain literal or a helper expression (see `helper-edit.ts`). */
  form: 'literal' | 'helper'
  /** For the literal form, the value the written text evaluates to. */
  expected?: unknown
  /** For the helper form, the expression the text was rendered from, and the local name of each class it references. */
  expression?: { value: Value, locals: ReadonlyMap<string, string> }
}

/** An edit of either kind that was not applied, with the reason. */
export interface SkippedEdit {
  path: string[]
  value: unknown
  reason: string
}

export interface EditResult {
  text: string
  applied: AppliedEdit[]
  skipped: SkippedEdit[]
  /** Helper classes added to the file's `checkly/constructs` import. */
  imports: string[]
}

export interface SourceStyle {
  quote: '\'' | '"'
  indentUnit: string
  lineEnding: '\n' | '\r\n'
}

type ObjectNode = TSESTree.ObjectExpression
type PropertyNode = TSESTree.Property

export type Resolution =
  | { kind: 'found', node: Node, parent: ObjectNode | TSESTree.ArrayExpression }
  | { kind: 'missing', parent: ObjectNode, key: string }
  | { kind: 'unsupported', reason: string }

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** The name of a plain `key: value` member, or undefined for a spread, method, accessor or computed key. */
export function memberName (property: PropertyNode | TSESTree.SpreadElement): string | undefined {
  if (property.type !== 'Property' || property.computed || property.kind !== 'init' || property.method) {
    return undefined
  }
  if (property.key.type === 'Identifier') {
    return property.key.name
  }
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value
  }
  return undefined
}

/**
 * Whether a node is a value this module could have written itself: a
 * string, number or boolean literal, a template with no `${}`, a negated
 * number, or an array or object built only of those. Such a node can be
 * replaced wholesale without losing anything but the comments inside it.
 */
export function isPlainLiteral (node: Node): boolean {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' || typeof node.value === 'number' || typeof node.value === 'boolean'
    case 'TemplateLiteral':
      return node.expressions.length === 0
    case 'UnaryExpression':
      return node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number'
    case 'ArrayExpression':
      return node.elements.every(element => element !== null && element.type !== 'SpreadElement' && isPlainLiteral(element))
    case 'ObjectExpression':
      return node.properties.every(property =>
        memberName(property) !== undefined
        && !(property as PropertyNode).shorthand
        && isPlainLiteral((property as PropertyNode).value))
    default:
      return false
  }
}

/** The value a plain literal node evaluates to; only meaningful when `isPlainLiteral` holds. */
export function evaluateLiteral (node: Node): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value
    case 'TemplateLiteral':
      return node.quasis.map(quasi => quasi.value.cooked ?? '').join('')
    case 'UnaryExpression':
      return -(evaluateLiteral(node.argument) as number)
    case 'ArrayExpression':
      return node.elements.map(element => (element === null ? undefined : evaluateLiteral(element)))
    case 'ObjectExpression':
      return Object.fromEntries(node.properties.map(property =>
        [memberName(property), evaluateLiteral((property as PropertyNode).value)]))
    default:
      return undefined
  }
}

export function describe (node: Node): string {
  switch (node.type) {
    case 'Identifier':
      return `the variable ${node.name}`
    case 'MemberExpression':
      return node.object.type === 'Identifier' && node.property.type === 'Identifier'
        ? `${node.object.name}.${node.property.name}`
        : 'a member expression'
    case 'CallExpression':
      return 'a function call'
    case 'NewExpression':
      return 'a constructor call'
    case 'TemplateLiteral':
      return node.expressions.length === 0 ? 'a string' : 'a template with expressions'
    case 'Literal':
      if (node.value === null) {
        return 'null'
      }
      if ('regex' in node && node.regex !== undefined) {
        return 'a regular expression'
      }
      return typeof node.value === 'bigint' ? 'a bigint' : 'a literal'
    case 'ArrayExpression':
      return node.elements.some(element => element === null) ? 'an array with holes' : 'an array with non-literal elements'
    case 'ObjectExpression':
      return 'an object with non-literal members'
    default:
      return node.type.startsWith('TS') ? 'a TypeScript expression' : 'not a plain literal'
  }
}

export interface ResolveOptions {
  /** Whether an existing node at the path may be replaced; a plain literal by default. */
  replaceable?: (node: Node) => boolean
  /** What a refused node should have been, for the reason. */
  expected?: string
  /**
   * Whether a `null` in the code may be replaced. A literal edit never
   * writes null (`renderValue`), so by default a null is left for the user;
   * a helper edit writes an expression and may replace it like any literal.
   */
  replaceNull?: boolean
}

/**
 * Where `path` lands inside `options`: an existing node that may be
 * replaced, a key the innermost object lacks, or a position this module
 * must not touch.
 */
export function resolvePath (options: ObjectNode, path: readonly string[], resolve: ResolveOptions = {}): Resolution {
  const { replaceable = isPlainLiteral, expected = 'a plain literal', replaceNull = false } = resolve
  if (path.length === 0) {
    return { kind: 'unsupported', reason: 'no property named' }
  }
  let node: Node = options
  let parent: ObjectNode | TSESTree.ArrayExpression = options
  for (let i = 0; i < path.length; i++) {
    const segment = path[i]
    const last = i === path.length - 1
    if (node.type === 'ObjectExpression') {
      const members = node.properties.filter(property => memberName(property) === segment) as PropertyNode[]
      if (members.length > 1) {
        return { kind: 'unsupported', reason: `${segment} is set twice in the code` }
      }
      if (members.length === 0) {
        if (!last) {
          return { kind: 'unsupported', reason: `${path.slice(0, i + 1).join('.')} is not set in the code` }
        }
        // A method, accessor or computed key could be this very property
        // under a spelling this module cannot read; adding a second one
        // would leave the object with two.
        if (node.properties.some(property => memberName(property) === undefined)) {
          const where = path.slice(0, i).join('.') || 'the options'
          return { kind: 'unsupported', reason: `${where} has members this tool cannot read` }
        }
        return { kind: 'missing', parent: node, key: segment }
      }
      if (members[0].shorthand) {
        return { kind: 'unsupported', reason: `${segment} is the variable ${segment}, not a literal` }
      }
      // A spread or an unreadable member after it could override the value
      // at runtime, which would make the edit look applied and change nothing.
      const index = node.properties.indexOf(members[0])
      if (node.properties.slice(index + 1).some(property => memberName(property) === undefined)) {
        return { kind: 'unsupported', reason: `${segment} may be overridden by a later member` }
      }
      parent = node
      node = members[0].value
    } else if (node.type === 'ArrayExpression') {
      const index = /^\d+$/.test(segment) ? Number(segment) : -1
      const element: Node | null | undefined = node.elements[index]
      if (element === null || element === undefined) {
        return { kind: 'unsupported', reason: `${path.slice(0, i + 1).join('.')} is not set in the code` }
      }
      parent = node
      node = element
    } else {
      return { kind: 'unsupported', reason: `${path.slice(0, i).join('.')} is ${describe(node)}, not an object literal` }
    }
  }
  if (node.type === 'Literal' && node.value === null && !replaceNull) {
    return { kind: 'unsupported', reason: `${path.join('.')} is null in the code; set a value by hand` }
  }
  if (!replaceable(node)) {
    return { kind: 'unsupported', reason: `${path.join('.')} is ${describe(node)}, not ${expected}` }
  }
  return { kind: 'found', node, parent }
}

/**
 * The conventions the edited object follows: the quote most of its strings
 * use (the whole file's when it has none), the indentation unit between it
 * and its members, and the file's line ending. Defaults (single quotes, two
 * spaces, LF) apply where there is no evidence.
 */
export function detectStyle (source: ParsedSource, options: ObjectNode): SourceStyle {
  const { text } = source
  const count = (root: Node) => {
    let single = 0
    let double = 0
    for (const node of walk(root)) {
      if (node.type === 'Literal' && typeof node.value === 'string') {
        if (text[node.range[0]] === '"') {
          double++
        } else {
          single++
        }
      }
    }
    return { single, double }
  }
  let quotes = count(options)
  if (quotes.single === 0 && quotes.double === 0) {
    quotes = count(source.program)
  }
  const lineEnding = lineEndingOf(text)
  let indentUnit = '  '
  const first = options.properties[0]
  if (first !== undefined && isMultiLine(text, options)) {
    const outer = indentationAt(text, options.range[0])
    const inner = indentationAt(text, first.range[0])
    if (inner.length > outer.length && inner.startsWith(outer)) {
      indentUnit = inner.slice(outer.length)
    }
  }
  return { quote: quotes.double > quotes.single ? '"' : '\'', indentUnit, lineEnding }
}

/** The line ending a file uses: CRLF when it holds one, else LF. */
export function lineEndingOf (text: string): SourceStyle['lineEnding'] {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

export function lineStart (text: string, offset: number): number {
  const index = text.lastIndexOf('\n', offset - 1)
  return index === -1 ? 0 : index + 1
}

/** The leading whitespace of the line holding `offset`. */
export function indentationAt (text: string, offset: number): string {
  const start = lineStart(text, offset)
  const match = /^[ \t]*/.exec(text.slice(start, offset))
  return match === null ? '' : match[0]
}

export function isMultiLine (text: string, node: Node): boolean {
  return text.slice(node.range[0], node.range[1]).includes('\n')
}

/** The comma token that follows a list's last member, if the list has one. */
export function trailingCommaOf (
  source: ParsedSource,
  list: ObjectNode | TSESTree.ArrayExpression,
): SourceToken | undefined {
  const members = list.type === 'ObjectExpression' ? list.properties : list.elements
  const last = members[members.length - 1]
  if (last === null || last === undefined) {
    return undefined
  }
  return tokensBetween(source, last.range[1], list.range[1] - 1).find(token => token.kind === 'token' && token.value === ',')
}

export function quoteString (value: string, quote: SourceStyle['quote']): string {
  // JSON.stringify encodes every control character and backslash; U+2028
  // and U+2029 it leaves in the clear, and a parser reading them as line
  // terminators would see an unterminated string. Only the quote character
  // needs swapping for a single-quoted file.
  const json = JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  if (quote === '"') {
    return json
  }
  return `'${json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, '\\\'')}'`
}

export function renderKey (key: string, quote: SourceStyle['quote']): string {
  // A bare `__proto__` in an object literal sets the prototype rather than
  // a property; quoted, it is a property like any other.
  return IDENTIFIER.test(key) && key !== '__proto__' ? key : quoteString(key, quote)
}

function isScalar (value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isPlainObject (value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * The source text for a value. Arrays of scalars stay on one line; arrays
 * holding objects, and objects, put one member per line indented one unit
 * past `column` (the indentation of the line the value starts on), unless
 * `inline` asks for the one-line form an existing node used. `trailingComma`
 * ends the last member of a multi-line list with a comma, as the edited
 * object does.
 *
 * @throws WriteBackSkipped for a value the construct cannot hold as a
 * literal: null or undefined (Checkly has cleared the property, and removing
 * it from the code would hand it to a default that need not match), a
 * non-finite number, or anything that is not JSON data.
 */
export function renderValue (
  value: unknown,
  style: SourceStyle,
  layout: { column: string, inline: boolean, trailingComma: boolean, at?: string },
): string {
  if (value === null || value === undefined) {
    throw new WriteBackSkipped(layout.at === undefined
      ? 'Checkly has no value for it; edit the property by hand'
      : `Checkly has no value for ${layout.at}; edit the property by hand`)
  }
  if (typeof value === 'string') {
    return quoteString(value, style.quote)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new WriteBackSkipped(`${value} cannot be written as a literal`)
    }
    return String(value)
  }
  if (typeof value === 'boolean') {
    return String(value)
  }
  const inner = layout.column + style.indentUnit
  const nested = (member: unknown, key: string) =>
    renderValue(member, style, { ...layout, column: inner, at: layout.at === undefined ? key : `${layout.at}.${key}` })
  if (Array.isArray(value)) {
    const members = value.map((member, index) => nested(member, String(index)))
    return layoutList('[', members, ']', style, { ...layout, inline: layout.inline || value.every(isScalar) })
  }
  if (isPlainObject(value)) {
    const members = Object.entries(value).map(([key, member]) => `${renderKey(key, style.quote)}: ${nested(member, key)}`)
    return layoutList('{', members, '}', style, layout)
  }
  const kind = typeof value === 'object' ? (value.constructor?.name ?? 'object') : typeof value
  throw new WriteBackSkipped(`a ${kind} cannot be written as a literal`)
}

/**
 * A list of rendered members between `open` and `close`: empty as `[]` or
 * `{}`, on one line when `inline`, otherwise one member per line indented one
 * unit past `column`, the last ending with a comma when `trailingComma`.
 */
export function layoutList (
  open: string,
  members: readonly string[],
  close: string,
  style: SourceStyle,
  layout: { column: string, inline: boolean, trailingComma: boolean },
): string {
  if (members.length === 0) {
    return `${open}${close}`
  }
  if (layout.inline) {
    return open === '{' ? `{ ${members.join(', ')} }` : `${open}${members.join(', ')}${close}`
  }
  const inner = layout.column + style.indentUnit
  return `${open}${style.lineEnding}${members.map(member => `${inner}${member}`).join(`,${style.lineEnding}`)}`
    + `${layout.trailingComma ? ',' : ''}${style.lineEnding}${layout.column}${close}`
}

/**
 * The indentation a member added to `parent` gets: that of the last
 * member's line when it starts one, otherwise one unit past the object's
 * own line (which also covers an empty object).
 */
export function memberColumn (text: string, parent: ObjectNode, style: SourceStyle): string {
  const last = parent.properties[parent.properties.length - 1]
  if (last !== undefined) {
    const indentation = indentationAt(text, last.range[0])
    if (lineStart(text, last.range[0]) + indentation.length === last.range[0]) {
      return indentation
    }
  }
  return indentationAt(text, parent.range[0]) + style.indentUnit
}

/**
 * The single splice that adds `pending` members to `parent`, after its last
 * member. A multi-line object gets one line per member at the last member's
 * indentation, a trailing comma on the last new member only if the object
 * already used one, and a comma added right after the old last member if it
 * had none. The new lines go after the line the last member (or its comma)
 * ends on, so a comment on that line stays with that member — unless a
 * comment runs on past that line end, in which case they go right after the
 * member's comma rather than into the comment. A one-line object gets
 * `, key: value` before its closing brace, and an empty one is rewritten as
 * `{ key: value }`.
 */
export function insertionSplice (
  text: string,
  source: ParsedSource,
  parent: ObjectNode,
  pending: readonly { key: string, rendered: string }[],
  style: SourceStyle,
): Splice {
  const members = pending.map(({ key, rendered }) => `${renderKey(key, style.quote)}: ${rendered}`)
  const last = parent.properties[parent.properties.length - 1]
  const closing = parent.range[1] - 1
  if (last === undefined) {
    // Between the braces, so a comment inside `{ }` stays; the braces and
    // whatever they hold are not replaced.
    const at = parent.range[0] + 1
    // Whitespace alone between the braces is replaced; a comment stays,
    // after the new members.
    const held = tokensBetween(source, at, closing).length > 0
    const end = held ? at : closing
    if (!isMultiLine(text, parent)) {
      return { start: at, end, text: ` ${members.join(', ')}${held ? ',' : ' '}` }
    }
    const inner = indentationAt(text, parent.range[0]) + style.indentUnit
    const lines = members.map(member => `${style.lineEnding}${inner}${member}`).join(',')
    const close = held ? ',' : `${style.lineEnding}${indentationAt(text, parent.range[0])}`
    return { start: at, end, text: `${lines}${close}` }
  }
  if (!isMultiLine(text, parent)) {
    // `{ a: 1 }` or `{ a: 1, }`: the new members join the line.
    const comma = trailingCommaOf(source, parent)
    const text = `${comma === undefined ? ',' : ''} ${members.join(', ')}${comma === undefined ? '' : ','}`
    return { start: afterMember(last, comma), end: afterMember(last, comma), text }
  }
  return appendAfterLast(source, last, closing, members, memberColumn(text, parent, style), style.lineEnding)
}

const afterMember = (last: Node, comma: SourceToken | undefined): number =>
  comma === undefined ? last.range[1] : comma.range[1]
