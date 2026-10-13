/**
 * A line-oriented diff, used to show what a deploy would change about a
 * resource: the construct as Checkly currently has it against the construct
 * the local code would produce.
 *
 * Deliberately implemented here rather than taken from a package. The output
 * is read by people in a terminal, the inputs are a few dozen lines of
 * generated code, and a diff library would be a new dependency of a CLI that
 * ships to users for the sake of one screen of code.
 */

/** Lines of leading and trailing context kept around each changed run. */
const DEFAULT_CONTEXT = 3

/**
 * Largest number of lines either side may have before the diff is declined.
 * The comparison is a quadratic dynamic program over the lines that actually
 * differ, so a pathological input (two unrelated thousand-line scripts) would
 * cost a multiple of a million cells for output nobody would read. Callers
 * have a coarser listing to fall back to.
 */
const DEFAULT_MAX_LINES = 1500

/**
 * Cells the dynamic program may allocate, whatever `maxLines` says. The line
 * guard above is about output nobody would read; this one is about the
 * allocation itself, which is the product of the two sides and so grows far
 * faster — without it, a caller raising `maxLines` gets a `RangeError` from
 * the typed array instead of the `undefined` this function promises for an
 * input it declines. Four million cells is 16 MB, and comfortably above what
 * the default line guard can reach.
 */
const MAX_CELLS = 4_000_000

export interface DiffLinesOptions {
  /** Lines of context around each change. Defaults to 3. */
  context?: number
  /** Lines per side above which no diff is produced. Defaults to 1500. */
  maxLines?: number
  /**
   * Treat the texts as the source of an object literal, one property per
   * line or indented block: the two sides are never aligned on a line of
   * only brackets and commas, and within a changed run each property's old
   * lines are followed by its new ones (see {@link pairProperties}). Off by
   * default, which is right for a script or any other plain text.
   */
  pairProperties?: boolean
}

/** One line of the edit script: kept on both sides, or on one side only. */
interface Edit {
  kind: 'context' | 'remove' | 'add'
  line: string
}

/**
 * A line of nothing but brackets, braces, commas and the like: `],`, `}, {`,
 * a blank line. Such a line is the same on both sides by accident, not
 * because the property it closes is, so the comparison must not align the two
 * sides on it: aligned on the `],` that ends two different `tags` lists, a
 * diff of several neighbouring properties ends up with every removal above
 * one addition and the rest of the additions below.
 */
const STRUCTURAL = /^[\s[\]{}(),;]*$/

/**
 * A line that opens a property of an object literal, capturing its key:
 * `frequency: …`, `'content-type': …`. The continuation lines of a value
 * spelled over several lines are indented deeper, or are structural.
 */
const PROPERTY_KEY = /^\s*([A-Za-z_$][\w$]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:/

function indentOf (line: string): number {
  return line.length - line.trimStart().length
}

/**
 * The indent of the shallowest line that is not structural: a blank line
 * sits at column 0 and a closing bracket one level out from what it closes,
 * and neither says where the properties of a run sit.
 */
function shallowestIndent (lines: string[]): number {
  const telling = lines.filter(line => !STRUCTURAL.test(line))
  return Math.min(...(telling.length > 0 ? telling : lines).map(indentOf))
}

/**
 * Splits text into lines, treating a trailing newline as a line terminator
 * rather than as an empty last line, so `'a\n'` and `'a'` both have one line
 * and neither reports a phantom change against the other.
 */
function toLines (text: string): string[] {
  if (text === '') {
    return []
  }
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

/**
 * The edit script turning `before` into `after`, one entry per line of either
 * side, via the longest common subsequence of the two.
 *
 * Identical head and tail lines are matched off before the dynamic program
 * runs — they are the bulk of any real comparison — and put back as context
 * afterwards, so the line numbering downstream needs no adjustment.
 *
 * @returns `undefined` when what is left after that trim would need more than
 * {@link MAX_CELLS} cells to compare.
 */
function editScript (before: string[], after: string[], anchorOnStructural: boolean): Edit[] | undefined {
  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) {
    head += 1
  }
  let tail = 0
  while (
    tail < before.length - head
    && tail < after.length - head
    && before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1
  }

  if (!anchorOnStructural) {
    // The identical tail is matched by text alone, so a closing bracket at
    // its start may close one property on one side and another on the
    // other: `],` ends `tags` here and `locations` there once `tags` became
    // a one-liner. A closer no shallower than every differing line is
    // handed back to the comparison, where it cannot anchor; a shallower
    // one closes something both sides share, like the construct's own `})`.
    const differing = [...before.slice(head, before.length - tail), ...after.slice(head, after.length - tail)]
    const shallowest = shallowestIndent(differing)
    const ambiguous = (line: string): boolean => STRUCTURAL.test(line) && indentOf(line) >= shallowest
    while (tail > 0 && ambiguous(before[before.length - tail])) {
      tail -= 1
    }
  }

  const a = before.slice(head, before.length - tail)
  const b = after.slice(head, after.length - tail)

  const n = a.length
  const m = b.length
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    return undefined
  }
  const width = m + 1
  // lengths[i][j] is the LCS length of a[i..] and b[j..], filled from the end
  // so the walk below can go forwards and keep the two sides in step.
  const lengths = new Int32Array((n + 1) * width)
  const same = (x: string, y: string): boolean => x === y && (anchorOnStructural || !STRUCTURAL.test(x))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i * width + j] = same(a[i], b[j])
        ? lengths[(i + 1) * width + j + 1] + 1
        : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1])
    }
  }

  const edits: Edit[] = []
  for (const line of before.slice(0, head)) {
    edits.push({ kind: 'context', line })
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (same(a[i], b[j])) {
      edits.push({ kind: 'context', line: a[i] })
      i += 1
      j += 1
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      // Dropping a[i] keeps at least as much of the common subsequence as
      // dropping b[j] would; ties go to the deletion so a replaced line reads
      // as `-old` then `+new`.
      edits.push({ kind: 'remove', line: a[i] })
      i += 1
    } else {
      edits.push({ kind: 'add', line: b[j] })
      j += 1
    }
  }
  while (i < n) {
    edits.push({ kind: 'remove', line: a[i] })
    i += 1
  }
  while (j < m) {
    edits.push({ kind: 'add', line: b[j] })
    j += 1
  }

  for (const line of before.slice(before.length - tail)) {
    edits.push({ kind: 'context', line })
  }

  return edits
}

/** The lines of one side of a changed run that belong to one property. */
interface Span {
  /** The property's key, or undefined for lines that continue the property opened above the run. */
  key: string | undefined
  lines: string[]
}

/**
 * Splits one side of a changed run into property spans. A property starts at
 * a key line on the shallowest indent of the run; every other line continues
 * the span before it. Lines before the first key continue a property opened
 * above the run (the items of a list whose `tags: [` matched on both sides),
 * and are kept as a span without a key.
 */
function toSpans (lines: string[], indent: number): Span[] {
  const spans: Span[] = []
  for (const line of lines) {
    const key = indentOf(line) === indent ? PROPERTY_KEY.exec(line)?.[1] : undefined
    const last = spans[spans.length - 1]
    if (key === undefined && last !== undefined) {
      last.lines.push(line)
    } else {
      spans.push({ key, lines: [line] })
    }
  }
  return spans
}

/**
 * Reorders every changed run of an edit script so that a property removed on
 * one side and added on the other reads as its old lines directly followed by
 * its new ones, rather than as all removals of the run followed by all
 * additions. Two spans pair when they open the same key, or when both continue
 * the property opened above the run. A pair is compared again on its own,
 * where a structural line may anchor, so the `],` that ends both versions of
 * a list is context and only the items differ; a pair with nothing in common
 * is its removals then its additions. A span with no partner keeps its place
 * in the order of its own side.
 */
function pairProperties (edits: Edit[]): Edit[] {
  const result: Edit[] = []
  let index = 0
  while (index < edits.length) {
    if (edits[index].kind === 'context') {
      result.push(edits[index])
      index += 1
      continue
    }
    const run: Edit[] = []
    while (index < edits.length && edits[index].kind !== 'context') {
      run.push(edits[index])
      index += 1
    }
    result.push(...pairRun(run))
  }
  return result
}

function pairRun (run: Edit[]): Edit[] {
  const removed = run.filter(edit => edit.kind === 'remove').map(edit => edit.line)
  const added = run.filter(edit => edit.kind === 'add').map(edit => edit.line)
  const indent = shallowestIndent([...removed, ...added])
  const removedSpans = toSpans(removed, indent)
  const addedSpans = toSpans(added, indent)

  // Pairs are made in order on both sides: a removed span takes the first
  // added span of its key after the last pair, and the added spans passed
  // over on the way are emitted first, so the result still lists every line
  // of either side in that side's order. A key the two sides list in
  // different places stays unpaired rather than being pulled out of order.
  const adds = (span: Span): Edit[] => span.lines.map(line => ({ kind: 'add', line }))
  const result: Edit[] = []
  let nextAdded = 0
  for (const span of removedSpans) {
    const index = addedSpans.findIndex((candidate, at) => at >= nextAdded && candidate.key === span.key)
    if (index === -1) {
      result.push(...span.lines.map(line => ({ kind: 'remove' as const, line })))
      continue
    }
    result.push(...addedSpans.slice(nextAdded, index).flatMap(adds))
    result.push(...pairSpans(span.lines, addedSpans[index].lines))
    nextAdded = index + 1
  }
  result.push(...addedSpans.slice(nextAdded).flatMap(adds))
  return result
}

/** The diff of one property's old lines against its new ones. */
function pairSpans (removed: string[], added: string[]): Edit[] {
  // A pair is never larger than the run it came from, which was compared
  // already, so the comparison cannot decline it; the fallback only keeps
  // the types honest.
  const inner = editScript(removed, added, true) ?? []
  // A pair with no line in common is already its removals then its
  // additions. One with a common line has changed runs shorter than the
  // pair, so pairing them in turn terminates.
  return inner.some(edit => edit.kind === 'context') ? pairProperties(inner) : inner
}

interface Hunk {
  edits: Edit[]
}

/**
 * Groups the edit script into hunks: every changed line with `context` lines
 * either side, and two changed runs separated by no more than twice that
 * merged into one, which is what keeps a diff of scattered small edits from
 * repeating the same lines under two headers.
 */
function toHunks (edits: Edit[], context: number): Hunk[] {
  const ranges: Array<[number, number]> = []
  edits.forEach((edit, index) => {
    if (edit.kind === 'context') {
      return
    }
    const from = Math.max(0, index - context)
    const to = Math.min(edits.length - 1, index + context)
    const last = ranges[ranges.length - 1]
    if (last !== undefined && from <= last[1] + 1) {
      last[1] = Math.max(last[1], to)
    } else {
      ranges.push([from, to])
    }
  })
  return ranges.map(([from, to]) => ({ edits: edits.slice(from, to + 1) }))
}

/** One line of a diff: a hunk boundary (with no text of its own), or a line of either side. */
export interface DiffLine {
  kind: 'context' | 'add' | 'remove' | 'hunk'
  text: string
}

/**
 * The diff of two texts as typed lines, without colour — the caller decides
 * how to present them.
 *
 * Hunk grouping follows `git diff` and GNU `diff -u`, which is the shape a
 * reader recognises. When two sides can be aligned in more than one minimal
 * way, which edit script you get is a matter of heuristics, and this one's is
 * not git's: the result is always a valid diff of the same two texts, listing
 * every line of either side in that side's order, but it may group its hunks
 * differently from the diff the same input would get from git. With
 * `pairProperties` it is not minimal either: the two sides are never aligned
 * on a line of only brackets and commas (see {@link STRUCTURAL}), and within
 * a changed run the lines of one property are kept together, old then new
 * (see {@link pairProperties}), so that several neighbouring properties
 * changing at once read as one `-`/`+` pair per property rather than as a
 * block of removals over a block of additions.
 *
 * @returns An empty array when the two sides are identical (or differ only by
 * a trailing newline), `undefined` when they are too large to compare (see
 * {@link DEFAULT_MAX_LINES} and {@link MAX_CELLS}), and otherwise one `hunk`
 * line per changed region followed by that region's lines.
 */
export function diffLines (
  before: string,
  after: string,
  options: DiffLinesOptions = {},
): DiffLine[] | undefined {
  const {
    context = DEFAULT_CONTEXT,
    maxLines = DEFAULT_MAX_LINES,
    pairProperties: byProperty = false,
  } = options

  if (before === after) {
    return []
  }

  const beforeLines = toLines(before)
  const afterLines = toLines(after)
  if (beforeLines.length > maxLines || afterLines.length > maxLines) {
    return undefined
  }

  const edits = editScript(beforeLines, afterLines, !byProperty)
  if (edits === undefined) {
    return undefined
  }

  const hunks = toHunks(byProperty ? pairProperties(edits) : edits, context)
  if (hunks.length === 0) {
    // The texts differ only by the trailing newline that `toLines` dropped.
    return []
  }

  const lines: DiffLine[] = []
  for (const hunk of hunks) {
    lines.push({ kind: 'hunk', text: '' })
    for (const edit of hunk.edits) {
      lines.push({ kind: edit.kind, text: edit.line })
    }
  }
  return lines
}
