import type { TSESTree } from '@typescript-eslint/typescript-estree'
import { type Node, type ParsedSource, type SourceToken, WriteBackSkipped, walk } from './source-file.js'

/**
 * Splices literal values into the options object of a construct call.
 *
 * Every edit names a path inside the object (`['request', 'url']`) and the
 * value that position should hold. A position that exists and holds a plain
 * literal is replaced; a key the innermost object lacks is inserted after
 * the object's last member; anything else — a `Frequency.*` constant, a
 * variable, a spread, a missing parent — is refused, because a rewrite that
 * guesses what the code means is worse than none.
 *
 * The file is edited by byte range, so nothing outside the touched values
 * changes. The rendering of a new value copies what surrounds it: the quote
 * character the object already uses, its indentation unit, whether it ends
 * members with a trailing comma, and the file's line ending. Commas and
 * comments are located through the parser's tokens, so a comma or a line
 * break inside a comment cannot mislead a splice. (`src/sourcegen` renders construct source too, but it
 * orders keys and fixes the style, which is what a splice into a user's
 * file must not do.)
 */

export interface LiteralEdit {
  /** Property path inside the options object; a numeric segment indexes an array. */
  path: string[]
  /** The value to write. `null` and `undefined` are refused (see `renderValue`). */
  value: unknown
}

export interface AppliedEdit extends LiteralEdit {
  /** The source text the edit replaced, or undefined when the property was added. */
  previous?: string
  /** The text written for the value. */
  rendered: string
}

export interface SkippedEdit extends LiteralEdit {
  reason: string
}

export interface EditResult {
  text: string
  applied: AppliedEdit[]
  skipped: SkippedEdit[]
}

export interface SourceStyle {
  quote: '\'' | '"'
  indentUnit: string
  lineEnding: '\n' | '\r\n'
}

type ObjectNode = TSESTree.ObjectExpression
type PropertyNode = TSESTree.Property

type Resolution =
  | { kind: 'found', node: Node }
  | { kind: 'missing', parent: ObjectNode, key: string }
  | { kind: 'unsupported', reason: string }

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** The name of a plain `key: value` member, or undefined for a spread, method, accessor or computed key. */
function memberName (property: PropertyNode | TSESTree.SpreadElement): string | undefined {
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

function describe (node: Node): string {
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

/**
 * Where `path` lands inside `options`: an existing plain literal, a key the
 * innermost object lacks, or a position this module must not touch.
 */
export function resolvePath (options: ObjectNode, path: readonly string[]): Resolution {
  if (path.length === 0) {
    return { kind: 'unsupported', reason: 'no property named' }
  }
  let node: Node = options
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
      node = members[0].value
    } else if (node.type === 'ArrayExpression') {
      const index = /^\d+$/.test(segment) ? Number(segment) : -1
      const element: Node | null | undefined = node.elements[index]
      if (element === null || element === undefined) {
        return { kind: 'unsupported', reason: `${path.slice(0, i + 1).join('.')} is not set in the code` }
      }
      node = element
    } else {
      return { kind: 'unsupported', reason: `${path.slice(0, i).join('.')} is ${describe(node)}, not an object literal` }
    }
  }
  if (node.type === 'Literal' && node.value === null) {
    return { kind: 'unsupported', reason: `${path.join('.')} is null in the code; set a value by hand` }
  }
  if (!isPlainLiteral(node)) {
    return { kind: 'unsupported', reason: `${path.join('.')} is ${describe(node)}, not a plain literal` }
  }
  return { kind: 'found', node }
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
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n'
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

function lineStart (text: string, offset: number): number {
  const index = text.lastIndexOf('\n', offset - 1)
  return index === -1 ? 0 : index + 1
}

/** The leading whitespace of the line holding `offset`. */
function indentationAt (text: string, offset: number): string {
  const start = lineStart(text, offset)
  const match = /^[ \t]*/.exec(text.slice(start, offset))
  return match === null ? '' : match[0]
}

function isMultiLine (text: string, node: Node): boolean {
  return text.slice(node.range[0], node.range[1]).includes('\n')
}

/** The tokens and comments lying within `[start, end)`. */
function tokensBetween (source: ParsedSource, start: number, end: number): SourceToken[] {
  return source.tokens.filter(token => token.range[0] >= start && token.range[1] <= end)
}

/** The comma token that follows a list's last member, if the list has one. */
function trailingCommaOf (source: ParsedSource, list: ObjectNode | TSESTree.ArrayExpression): SourceToken | undefined {
  const members = list.type === 'ObjectExpression' ? list.properties : list.elements
  const last = members[members.length - 1]
  if (last === null || last === undefined) {
    return undefined
  }
  return tokensBetween(source, last.range[1], list.range[1] - 1).find(token => token.kind === 'token' && token.value === ',')
}

function quoteString (value: string, quote: SourceStyle['quote']): string {
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

function renderKey (key: string, quote: SourceStyle['quote']): string {
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
  const block = (open: string, members: string[], close: string) =>
    `${open}${style.lineEnding}${members.map(member => `${inner}${member}`).join(`,${style.lineEnding}`)}`
    + `${layout.trailingComma ? ',' : ''}${style.lineEnding}${layout.column}${close}`
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    const members = value.map((member, index) => nested(member, String(index)))
    return layout.inline || value.every(isScalar) ? `[${members.join(', ')}]` : block('[', members, ']')
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return '{}'
    }
    const members = entries.map(([key, member]) => `${renderKey(key, style.quote)}: ${nested(member, key)}`)
    return layout.inline ? `{ ${members.join(', ')} }` : block('{', members, '}')
  }
  const kind = typeof value === 'object' ? (value.constructor?.name ?? 'object') : typeof value
  throw new WriteBackSkipped(`a ${kind} cannot be written as a literal`)
}

interface Splice {
  start: number
  end: number
  text: string
}

/**
 * Applies `edits` to the text of `source` inside `options`, one of its
 * nodes. Edits are resolved against the original ranges and spliced from
 * the end of the file backwards, so no edit shifts another. Two edits that
 * touch the same bytes cannot both be right: a replacement wins over an
 * insertion into the object it replaces, and otherwise the first listed
 * wins; the loser is skipped. Replacements are reported before insertions.
 * The result is text only: to edit it again, parse it again.
 */
export function applyLiteralEdits (
  source: ParsedSource,
  options: ObjectNode,
  edits: readonly LiteralEdit[],
): EditResult {
  const { text } = source
  const style = detectStyle(source, options)
  const applied: AppliedEdit[] = []
  const skipped: SkippedEdit[] = []
  const splices: Splice[] = []
  const insertions = new Map<ObjectNode, { key: string, rendered: string, edit: LiteralEdit }[]>()

  const claim = (splice: Splice): boolean => {
    const clash = splices.some(other => splice.start < other.end && other.start < splice.end)
    if (!clash) {
      splices.push(splice)
    }
    return !clash
  }

  for (const edit of edits) {
    try {
      const resolution = resolvePath(options, edit.path)
      if (resolution.kind === 'unsupported') {
        skipped.push({ ...edit, reason: resolution.reason })
        continue
      }
      if (resolution.kind === 'found') {
        const { node } = resolution
        const rendered = renderValue(edit.value, style, {
          at: edit.path.join('.'),
          column: indentationAt(text, node.range[0]),
          inline: !isMultiLine(text, node),
          trailingComma: (node.type === 'ArrayExpression' || node.type === 'ObjectExpression')
            && trailingCommaOf(source, node) !== undefined,
        })
        if (!claim({ start: node.range[0], end: node.range[1], text: rendered })) {
          skipped.push({ ...edit, reason: 'overlaps another edit' })
          continue
        }
        applied.push({ ...edit, previous: text.slice(node.range[0], node.range[1]), rendered })
        continue
      }
      const { parent, key } = resolution
      const rendered = renderValue(edit.value, style, {
        at: edit.path.join('.'),
        column: memberColumn(text, parent, style),
        inline: !isMultiLine(text, parent),
        trailingComma: trailingCommaOf(source, parent) !== undefined,
      })
      const pending = insertions.get(parent) ?? []
      if (pending.some(other => other.key === key)) {
        skipped.push({ ...edit, reason: 'overlaps another edit' })
        continue
      }
      pending.push({ key, rendered, edit })
      insertions.set(parent, pending)
    } catch (err) {
      if (err instanceof WriteBackSkipped) {
        skipped.push({ ...edit, reason: err.message })
        continue
      }
      throw err
    }
  }

  for (const [parent, pending] of insertions) {
    const splice = insertionSplice(text, source, parent, pending, style)
    if (!claim(splice)) {
      for (const { edit } of pending) {
        skipped.push({ ...edit, reason: 'overlaps another edit' })
      }
      continue
    }
    for (const { edit, rendered } of pending) {
      applied.push({ ...edit, rendered })
    }
  }

  splices.sort((a, b) => b.start - a.start)
  let result = text
  for (const splice of splices) {
    result = result.slice(0, splice.start) + splice.text + result.slice(splice.end)
  }
  return { text: result, applied, skipped }
}

/**
 * The indentation a member added to `parent` gets: that of the last
 * member's line when it starts one, otherwise one unit past the object's
 * own line (which also covers an empty object).
 */
function memberColumn (text: string, parent: ObjectNode, style: SourceStyle): string {
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
function insertionSplice (
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
  const comma = trailingCommaOf(source, parent)
  const afterMember = comma === undefined ? last.range[1] : comma.range[1]
  if (!isMultiLine(text, parent)) {
    // `{ a: 1 }` or `{ a: 1, }`: the new members join the line.
    const text = `${comma === undefined ? ',' : ''} ${members.join(', ')}${comma === undefined ? '' : ','}`
    return { start: afterMember, end: afterMember, text }
  }
  const breakAt = text.indexOf('\n', afterMember)
  const lineEnd = breakAt === -1 || breakAt >= closing
    ? afterMember
    : text[breakAt - 1] === '\r' ? breakAt - 1 : breakAt
  const straddles = tokensBetween(source, last.range[1], closing)
    .some(token => token.range[0] < lineEnd && token.range[1] > lineEnd)
  const at = straddles ? afterMember : lineEnd
  const column = memberColumn(text, parent, style)
  const lines = members.map(member => `${style.lineEnding}${column}${member}`).join(',')
  if (comma === undefined) {
    // The comma goes on the member; whatever sat between it and the line
    // end (a comment) is kept, and the new lines follow.
    return { start: last.range[1], end: at, text: `,${text.slice(last.range[1], at)}${lines}` }
  }
  return { start: at, end: at, text: `${lines},` }
}
