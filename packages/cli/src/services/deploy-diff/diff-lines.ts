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
}

/** One line of the edit script: kept on both sides, or on one side only. */
interface Edit {
  kind: 'context' | 'remove' | 'add'
  line: string
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
function editScript (before: string[], after: string[]): Edit[] | undefined {
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
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i * width + j] = a[i] === b[j]
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
    if (a[i] === b[j]) {
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
 * not git's: the result is always a valid, minimal diff of the same two texts,
 * but it may group its hunks differently from the diff the same input would
 * get from git.
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
  } = options

  if (before === after) {
    return []
  }

  const beforeLines = toLines(before)
  const afterLines = toLines(after)
  if (beforeLines.length > maxLines || afterLines.length > maxLines) {
    return undefined
  }

  const edits = editScript(beforeLines, afterLines)
  if (edits === undefined) {
    return undefined
  }

  const hunks = toHunks(edits, context)
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
