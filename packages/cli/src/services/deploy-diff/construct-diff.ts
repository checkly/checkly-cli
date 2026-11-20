import { randomUUID } from 'node:crypto'
import { ConstructCodegen } from '../../constructs/construct-codegen.js'
import type { Resource } from '../../constructs/construct-codegen.js'
import { Context, renderConstruct, type ProjectDefaults, type ReferencedNames } from '../../constructs/internal/codegen/index.js'
import type { DiffChange, DiffEntry } from '../../rest/projects.js'
import { Program } from '../../sourcegen/index.js'
import { isMaskedMarker, markChanged, MASK, nodeAt, pointerSegments, registerUnderCodeName } from './import-shape.js'
import { diffLines, type DiffLine } from './diff-lines.js'
import type { VariableNames } from './variable-names.js'

/**
 * The construct diff of one resource: two import-format payloads rendered by
 * the import codegen and compared as text, with what the construct cannot
 * show (a script kept in a file of its own, a change named only by its
 * cause) stated after it. The caller decides what the two sides are and how
 * a change's origin reads; nothing here reads the loaded project.
 */

/**
 * One line printed under an updated resource. A `DiffLine` is a line of the
 * construct diff; a `note` is a fact stated in words (a change the diff
 * cannot show, a secret's movement, a listed property); a `reason` says why
 * the listing stands in for the diff; a `nested` line belongs to the text
 * diff of a property kept in a file of its own, printed under its `note`.
 */
export type RenderedLine =
  | DiffLine
  | { kind: 'note', text: string }
  | { kind: 'reason', text: string }
  | { kind: 'nested', line: DiffLine }

/**
 * The words appended to a change's line to say where the change came from
 * and what becomes of it; empty when there is nothing to say.
 */
export type OriginNote = (change: DiffChange) => string

export const note = (text: string): RenderedLine => ({ kind: 'note', text })

/** The line with its text transformed, whichever kind it is. */
function mapText (line: RenderedLine, fn: (text: string) => string): RenderedLine {
  if (line.kind === 'nested') {
    return { kind: 'nested', line: { ...line.line, text: fn(line.line.text) } }
  }
  return { ...line, text: fn(line.text) }
}

const textOf = (line: RenderedLine): string => line.kind === 'nested' ? line.line.text : line.text

const INLINE_VALUE_CAP = 256

/**
 * Properties a codegen writes to a file of its own rather than into the
 * construct — a browser or multi-step check's script to a spec file, an API
 * check's setup and teardown scripts to support files, a dashboard's CSS to
 * a style file — leaving an `entrypoint` path behind. A change to one is
 * invisible in the construct diff and is shown as a text diff of its own,
 * whether or not the constructs differ too.
 */
const OUTSIDE_CONSTRUCT: Readonly<Record<string, ReadonlySet<string>>> = {
  check: new Set(['/script', '/localSetupScript', '/localTearDownScript']),
  dashboard: new Set(['/customCSS']),
}

export function isOutsideConstruct (type: string, path: string): boolean {
  return OUTSIDE_CONSTRUCT[type]?.has(path) ?? false
}

/**
 * Whether a redaction rule reaches the path a secret change names: the two
 * agree segment for segment as far as the shorter goes, a rule's `*` standing
 * for any one segment. A rule under the path blanks inside the list the
 * change reports whole; a rule above it blanks the object that holds it.
 */
export function ruleReaches (rulePath: string, changePath: string): boolean {
  const rule = pointerSegments(rulePath)
  const change = pointerSegments(changePath)
  const shared = Math.min(rule.length, change.length)
  for (let index = 0; index < shared; index += 1) {
    if (rule[index] !== '*' && rule[index] !== change[index]) {
      return false
    }
  }
  return true
}

export function isHash (value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && '$hash' in value
}

/** A marker spelled the way the construct prints it. */
const spellMarker = (_key: string, member: unknown): unknown =>
  (isMaskedMarker(member) ? (member.$masked === 'changed' ? `${MASK} (changed)` : MASK) : member)

function inline (value: unknown): string {
  if (value === undefined) {
    return '(absent)'
  }
  if (isHash(value)) {
    return '(content)'
  }
  const text = JSON.stringify(value, spellMarker)
  return text.length > INLINE_VALUE_CAP ? `${text.slice(0, INLINE_VALUE_CAP)}…` : text
}

/** The value at an RFC 6901 pointer, or undefined when the path does not resolve. */
export const valueAt = (root: unknown, pointer: string): unknown => nodeAt(root, pointerSegments(pointer))

/** One change as a line of the listing: path, values, and where it came from. */
function listChange (change: DiffChange, originNote: OriginNote): string {
  if (change.cause !== undefined) {
    return `${change.path}: changed (${change.cause})${originNote(change)}`
  }
  let values: string
  try {
    values = `${inline(change.before)} -> ${inline(change.after)}`
  } catch {
    // A value no JSON can spell (a cycle, a bigint) leaves the path alone.
    return `${change.path}: changed${originNote(change)}`
  }
  return `${change.path}: ${values}${originNote(change)}`
}

/**
 * Whether every change the entry reports is named by a cause and none is a
 * secret: such an entry is rendered as one `changed: <causes>` notice, with
 * no diff, so it needs no deployed state, and the API sends it none.
 */
export function changedByCauseAlone (entry: DiffEntry): boolean {
  const changes = entry.changes ?? []
  return changes.length > 0 && changes.every(change => change.secret !== true && change.cause !== undefined)
}

/** The changes listed one per line, after the reason the listing stands in for the diff, if one is given. */
export function listing (changes: readonly DiffChange[], originNote: OriginNote, reason?: string): RenderedLine[] {
  const lines: RenderedLine[] = reason === undefined ? [] : [{ kind: 'reason', text: `(${reason})` }]
  for (const change of changes) {
    lines.push(note(listChange(change, originNote)))
  }
  return lines
}

/**
 * The import codegen, with the rendered construct's own variable named as in
 * the user's code, or else after its logical id, on both sides.
 */
class SideCodegen extends ConstructCodegen {
  constructor (program: Program, private readonly variableNames: VariableNames | undefined) {
    super(program)
  }

  prepare (logicalId: string, resource: Resource, context: Context): void {
    super.prepare(logicalId, resource, context)
    registerUnderCodeName(context, resource, this.variableNames)
  }
}

/** How both sides of a comparison are rendered. */
export interface RenderSettings {
  variableNames: VariableNames | undefined
  /** See `ContextOptions.spelledOut`. */
  spelledOut: ReadonlySet<string> | undefined
  /**
   * See `ContextOptions.projectDefaults`: a property these defaults supply
   * reads as left out, `{}` stands for a project without defaults, and
   * `undefined` writes every property.
   */
  projectDefaults: ProjectDefaults | undefined
  /** See `ContextOptions.referencedNames`: the names a `fromId()` reference carries in a comment. */
  referencedNames?: ReferencedNames
  /**
   * Registers what the construct may refer to (other resources of the
   * project) before it is rendered. Without it a reference is rendered by
   * its physical id.
   */
  register?: (context: Context, program: Program) => void
}

/**
 * A side of the comparison rendered to source text, with its relations (the
 * resources rendered alongside the construct) registered first, and every
 * string of `maskedValues` printed as a masked secret.
 */
function renderSide (
  resource: Resource,
  relations: readonly Resource[],
  maskedValues: ReadonlySet<string>,
  settings: RenderSettings,
): string {
  const { variableNames, spelledOut, projectDefaults, referencedNames, register } = settings
  const program = new Program({
    rootDirectory: '.',
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })
  const context = new Context({ maskedValues, spelledOut, projectDefaults, referencedNames })
  const codegen = new SideCodegen(program, variableNames)
  register?.(context, program)
  for (const relation of relations) {
    codegen.prepare(relation.logicalId, relation, context)
  }
  return renderConstruct(codegen, resource.logicalId, resource, { context })
}

interface ContentDiffOptions {
  /** The most lines either text may take before only the fact of the change is reported. */
  maxLines: number | undefined
  /** Lines of context around each change; see `DiffLinesOptions.context`. */
  context?: number
  originNote: OriginNote
  /**
   * The line reporting a change whose two texts are not both at hand.
   * Defaults to `<path>: content changed` with the origin note.
   */
  unavailable?: (change: DiffChange) => string
}

/**
 * The text diff of a change whose values are content (a script, a body),
 * between the text each side holds at the change's pointer. Either side
 * missing means the pointer is spelled differently in the two vocabularies,
 * or the text was not kept, and only the fact is reported.
 */
function contentDiff (
  change: DiffChange,
  deployedText: unknown,
  currentText: unknown,
  options: ContentDiffOptions,
): RenderedLine[] {
  const { maxLines, context, originNote, unavailable } = options
  if (typeof deployedText !== 'string' || typeof currentText !== 'string') {
    return [note(unavailable?.(change) ?? `${change.path}: content changed${originNote(change)}`)]
  }
  const lines = diffLines(deployedText, currentText, { maxLines, context })
  if (lines === undefined) {
    return [note(`${change.path}: content changed (too large to show)${originNote(change)}`)]
  }
  const nested = lines.map((line): RenderedLine => ({ kind: 'nested', line }))
  return [note(`${change.path}:${originNote(change)}`), ...nested]
}

/** One side of the construct diff. */
export interface DiffSide {
  /** The construct's resource in the import format, already masked; secrets' marks are written into it. */
  resource: Resource
  /** Resources rendered alongside the construct (its relation rows). */
  relations: readonly Resource[]
  /** The reported value a secret change's mark is placed from on this side; undefined places none. */
  markFrom: (change: DiffChange) => unknown
  /**
   * Appended to the mask of a secret marked on this side, such as ` (changed)`;
   * empty for a bare mask. It is printed exactly as given: only the sentinel's
   * nonce tail is removed from the output.
   */
  label: string
  /** This side's text of a property kept in a file of its own (see {@link OUTSIDE_CONSTRUCT}). */
  textAt: (change: DiffChange) => unknown
}

export interface DiffSidesInput {
  type: string
  /** The reported changes that are not secret. */
  shown: readonly DiffChange[]
  /** The reported secret changes, marked inline where their mark can be placed. */
  secrets: readonly DiffChange[]
  /** Receives every secret change whose mark reached the returned lines. */
  marked: Set<DiffChange>
  /** The old side, printed with `-`. */
  before: DiffSide
  /** The new side, printed with `+`. */
  after: DiffSide
  render: RenderSettings
  originNote: OriginNote
  /** The most lines a diff may take before the listing is printed instead. */
  maxLines?: number
  /** Lines of context around each change, in the construct diff and in a nested text diff. */
  context?: number
  /** See `ContentDiffOptions.unavailable`. */
  unavailable?: (change: DiffChange) => string
  /**
   * The lines for changes the two renderings agree on despite them, in
   * place of the generic notes; undefined falls through to those notes.
   */
  agreeingNote?: (shown: readonly DiffChange[]) => RenderedLine[] | undefined
}

/**
 * Renders both sides and diffs them as text. A resource whose constructs
 * differ gets the construct diff, then the text diff of each property kept
 * in a file of its own, then each change named only by its cause. One whose
 * constructs agree gets those changes stated in words instead.
 */
export function diffSides (input: DiffSidesInput): RenderedLine[] {
  const { type, shown, secrets, marked, before, after, render, originNote, maxLines, context, unavailable } = input
  const { agreeingNote } = input
  // The element whose secret moved reads its side's label beside the mask,
  // so the diff names the secret beside its key. Each change writes its own
  // sentinel, unguessable by any value the account or the code could hold:
  // the mask, the side's label, and a tail (`#<nonce>-<index>)`) cut from
  // the output. Only a change whose sentinel reached the returned lines
  // counts as marked. The codegen prints a secret only as one of these
  // strings. Both sides' sentinels for a change end in the same tail: a
  // codegen that names a file or variable after the tail of a credential
  // (an unnamed Slack or PagerDuty channel takes the last four characters
  // of its URL or key) then derives the same name on both sides, and the
  // diff stays free of a spurious rename.
  const nonce = randomUUID()
  const sentinels = new Map<DiffChange, { before: string, after: string }>()
  secrets.forEach((change, index) => {
    const afterSentinel = `${MASK}${after.label}#${nonce}-${index})`
    const beforeSentinel = `${MASK}${before.label}#${nonce}-${index})`
    const onAfter = markChanged(after.resource.payload, change.path, after.markFrom(change), afterSentinel)
    const onBefore = markChanged(before.resource.payload, change.path, before.markFrom(change), beforeSentinel)
    if (onAfter || onBefore) {
      sentinels.set(change, { before: beforeSentinel, after: afterSentinel })
    }
  })
  const maskedValues = new Set([MASK, ...[...sentinels.values()].flatMap(pair => [pair.after, pair.before])])
  const tail = new RegExp(`#${nonce}-\\d+\\)`, 'g')
  const relabel = (text: string) => text.replace(tail, '')
  const showing = (lines: RenderedLine[]): RenderedLine[] => {
    for (const [change, pair] of sentinels) {
      if (lines.some(line => textOf(line).includes(pair.after) || textOf(line).includes(pair.before))) {
        marked.add(change)
      }
    }
    return lines.map(line => mapText(line, relabel))
  }
  const sideText = (side: DiffSide) => renderSide(side.resource, side.relations, maskedValues, render)
  const beforeText = sideText(before)
  const afterText = sideText(after)
  const rendered = diffLines(beforeText, afterText, { maxLines, context, pairProperties: true })
  if (rendered === undefined) {
    return shown.length > 0 ? listing(shown, originNote, 'the construct diff is too large to show') : []
  }
  const textDiff = (change: DiffChange) =>
    contentDiff(change, before.textAt(change), after.textAt(change), { maxLines, context, originNote, unavailable })
  if (rendered.length > 0) {
    // The constructs differ. What they cannot show follows: a property kept
    // in a file of its own as a text diff, and a change that is only a cause
    // (a new code bundle, a dependency list) as a line.
    const lines: RenderedLine[] = [...rendered]
    for (const change of shown) {
      if (isOutsideConstruct(type, change.path)) {
        lines.push(...textDiff(change))
      } else if (change.cause !== undefined) {
        lines.push(note(listChange(change, originNote)))
      }
    }
    return showing(lines)
  }
  // The renderings agree. The caller may know why (see `agreeingNote`).
  const agreeing = agreeingNote?.(shown)
  if (agreeing !== undefined) {
    return agreeing
  }
  // Otherwise what changed lives outside the construct (a script in its own
  // file, a request body), or is a value the codegen elides.
  const lines: RenderedLine[] = []
  for (const change of shown) {
    const hashed = isHash(change.before) || isHash(change.after) || isHash(change.remote?.after)
    if (hashed || isOutsideConstruct(type, change.path)) {
      lines.push(...textDiff(change))
    } else {
      lines.push(note(listChange(change, originNote)))
    }
  }
  return lines
}
