import type { TSESTree } from '@typescript-eslint/typescript-estree'

import {
  ASSERTION_BUILDERS,
  buildHelperValue,
  type HelperEdit,
  helperClass,
  isHelperEdit,
  isReplaceableByHelper,
  matchesValue,
  renderExpression,
  type SourceEdit,
} from './helper-edit.js'
import { appendImports, resolveImports } from './imports.js'
import { isDeepStrictEqual } from 'node:util'

import {
  type AppliedEdit,
  detectStyle,
  type EditResult,
  evaluateLiteral,
  indentationAt,
  insertionSplice,
  isMultiLine,
  isPlainLiteral,
  memberColumn,
  memberName,
  renderValue,
  resolvePath,
  type SkippedEdit,
  type SourceStyle,
  trailingCommaOf,
} from './literal-edit.js'
import { checklyBindings, localBinding, type Node, type ParsedSource, type Splice, walk, WriteBackSkipped } from './source-file.js'

export type { HelperEdit, SourceEdit }

/**
 * Applies literal and helper edits to the text of `source` inside `options`,
 * one of its nodes. Edits are resolved against the original ranges and
 * spliced from the end of the file backwards, so no edit shifts another.
 * Two edits that touch the same bytes cannot both be right: a replacement
 * wins over an insertion into the object it replaces, and otherwise the
 * first listed wins; the loser is skipped. Replacements are reported before
 * insertions. An edit whose text equals what the code already holds is
 * neither applied nor skipped: there is nothing to do.
 *
 * A helper edit that references a class the file does not import gets it
 * added to the file's `checkly/constructs` import in the same pass; when
 * that is not possible, the edit is skipped with the reason. The result is
 * text only: to edit it again, parse it again.
 */
export function applyEdits (
  source: ParsedSource,
  options: TSESTree.ObjectExpression,
  edits: readonly SourceEdit[],
): EditResult {
  const { text, program } = source
  const style = detectStyle(source, options)
  const applied: AppliedEdit[] = []
  // Skips are found in two passes (resolution, then range claims) and are
  // reported in the order the edits were given.
  const skips: { index: number, skipped: SkippedEdit }[] = []
  const skip = (edit: SourceEdit, reason: string) =>
    skips.push({ index: edits.indexOf(edit), skipped: { ...edit, reason } })

  const replacements: (Rendered & { splice: Splice, previous: string })[] = []
  const insertions = new Map<TSESTree.ObjectExpression, (Rendered & { key: string })[]>()

  for (const edit of edits) {
    try {
      const helper = isHelperEdit(edit) ? edit : undefined
      // Any assertion builder spells the property; the other kinds have one class each.
      const classes = helper === undefined ? [] : helper.helper === 'assertions' ? ASSERTION_BUILDERS : [helperClass(helper)]
      const locals = checklyBindings(program, new Set(classes))
      const resolution = helper === undefined
        ? resolvePath(options, edit.path)
        : resolvePath(options, edit.path, {
            replaceable: node => isReplaceableByHelper(node, locals),
            expected: `a literal or a ${helperClass(helper)} expression`,
            replaceNull: true,
          })
      if (resolution.kind === 'unsupported') {
        skip(edit, resolution.reason)
        continue
      }
      // A sibling the helper's property replaces (`doubleCheck` beside a
      // retry strategy) means the code says something else about it; a
      // spread could carry one too.
      const unless = helper?.unless ?? []
      const siblings = resolution.parent.type === 'ObjectExpression' ? resolution.parent.properties : []
      const conflict = unless.length === 0
        ? undefined
        : siblings.find(property => property.type === 'SpreadElement' || unless.includes(memberName(property) ?? ''))
      if (conflict !== undefined) {
        const name = conflict.type === 'SpreadElement' ? 'a spread' : memberName(conflict)
        skip(edit, `${name} is set in the code; replace it with ${edit.path.join('.')} by hand`)
        continue
      }
      if (resolution.kind === 'found') {
        const { node } = resolution
        const previous = text.slice(node.range[0], node.range[1])
        // The lists in the new text are laid out like the lists the replaced
        // node holds; a node without one (a number, a constant, null) is laid
        // out like the object holding it, as an inserted member would be.
        const model = firstList(node) ?? resolution.parent
        const rendered = render(program, style, edit, helper, {
          column: indentationAt(text, node.range[0]),
          inline: !isMultiLine(text, model),
          trailingComma: trailingCommaOf(source, model) !== undefined,
        }, node)
        // Nothing to do when the code already holds the value: the same
        // text, or for an expression the same structure however spelled.
        const unchanged = rendered.text === previous
          || (rendered.expression !== undefined
            && matchesValue(node, rendered.expression.value, rendered.expression.locals))
        if (!unchanged) {
          const splice = { start: node.range[0], end: node.range[1], text: rendered.text }
          replacements.push({ ...rendered, splice, previous })
        }
        continue
      }
      const { parent, key } = resolution
      const rendered = render(program, style, edit, helper, {
        column: memberColumn(text, parent, style),
        inline: !isMultiLine(text, parent),
        trailingComma: trailingCommaOf(source, parent) !== undefined,
      })
      const pending = insertions.get(parent) ?? []
      if (pending.some(other => other.key === key)) {
        skip(edit, 'overlaps another edit')
        continue
      }
      pending.push({ ...rendered, key })
      insertions.set(parent, pending)
    } catch (err) {
      if (err instanceof WriteBackSkipped) {
        skip(edit, err.message)
        continue
      }
      throw err
    }
  }

  // The classes the rendered expressions reference and the file lacks: an
  // edit whose class cannot be added is dropped before any range is claimed.
  const pendingAll = [...replacements, ...[...insertions.values()].flat()]
  const imports = resolveImports(source, pendingAll.flatMap(entry => entry.needs))
  const refusal = (entry: Rendered): string | undefined => {
    for (const name of entry.needs) {
      const reason = imports.refused.get(name)
      if (reason !== undefined) {
        return reason
      }
    }
    return undefined
  }

  const splices: Splice[] = []
  const claim = (splice: Splice): boolean => {
    const clash = splices.some(other => splice.start < other.end && other.start < splice.end)
    if (!clash) {
      splices.push(splice)
    }
    return !clash
  }
  const used = new Set<string>()
  const accept = (entry: Rendered, previous?: string) => {
    const { edit, text: rendered, form, expected, expression } = entry
    applied.push({ path: edit.path, value: edit.value, previous, rendered, form, expected, expression })
    entry.needs.forEach(name => used.add(name))
  }

  for (const entry of replacements) {
    const reason = refusal(entry)
    if (reason !== undefined) {
      skip(entry.edit, reason)
    } else if (!claim(entry.splice)) {
      skip(entry.edit, 'overlaps another edit')
    } else {
      accept(entry, entry.previous)
    }
  }

  for (const [parent, pending] of insertions) {
    const allowed = pending.filter(entry => {
      const reason = refusal(entry)
      if (reason !== undefined) {
        skip(entry.edit, reason)
      }
      return reason === undefined
    })
    if (allowed.length === 0) {
      continue
    }
    const members = allowed.map(entry => ({ key: entry.key, rendered: entry.text }))
    const splice = insertionSplice(text, source, parent, members, style)
    if (!claim(splice)) {
      for (const { edit } of allowed) {
        skip(edit, 'overlaps another edit')
      }
      continue
    }
    allowed.forEach(entry => accept(entry))
  }

  // Only the classes an applied edit references are imported; an edit
  // dropped above may have been the only one wanting a name. The import
  // lies outside the options object, so it cannot clash with an edit.
  const names = imports.missing.filter(name => used.has(name))
  const importSplice = appendImports(source, names)
  if (importSplice !== undefined) {
    claim(importSplice)
  }

  splices.sort((a, b) => b.start - a.start)
  let result = text
  for (const splice of splices) {
    result = result.slice(0, splice.start) + splice.text + result.slice(splice.end)
  }
  const skipped = skips.sort((a, b) => a.index - b.index).map(entry => entry.skipped)
  return { text: result, applied, skipped, imports: names }
}

/**
 * Whether a re-parse of the edited text holds, at the edit's path, what the
 * edit meant: the value a literal evaluates to, or the expression a helper
 * edit was rendered from (its classes under the names it was rendered with).
 * A splice that produced anything else is a bug, and the user's source is
 * not the place to find out.
 */
export function readsBack (options: TSESTree.ObjectExpression, edit: AppliedEdit): boolean {
  if (edit.expression === undefined) {
    const resolution = resolvePath(options, edit.path)
    return resolution.kind === 'found' && isDeepStrictEqual(evaluateLiteral(resolution.node), edit.expected)
  }
  const resolution = resolvePath(options, edit.path, { replaceable: () => true, replaceNull: true })
  return resolution.kind === 'found' && matchesValue(resolution.node, edit.expression.value, edit.expression.locals)
}

interface Rendered {
  edit: SourceEdit
  text: string
  form: AppliedEdit['form']
  expected?: unknown
  expression?: AppliedEdit['expression']
  /** Classes the text references that the file does not bind yet. */
  needs: string[]
}

/**
 * The text for one edit: a literal for a literal edit, or for a helper edit
 * whose target is a plain literal and which offers a literal alternative;
 * otherwise the helper expression, with the classes it references under the
 * names the file binds them to, and the rest listed as needed.
 */
function render (
  program: TSESTree.Program,
  style: SourceStyle,
  edit: SourceEdit,
  helper: HelperEdit | undefined,
  layout: { column: string, inline: boolean, trailingComma: boolean },
  node?: Node,
): Rendered {
  const at = edit.path.join('.')
  if (helper === undefined) {
    return { edit, text: renderValue(edit.value, style, { ...layout, at }), form: 'literal', expected: edit.value, needs: [] }
  }
  if (node !== undefined && helper.literalAlternative !== undefined && isPlainLiteral(node)) {
    const expected = helper.literalAlternative
    return { edit, text: renderValue(expected, style, { ...layout, at }), form: 'literal', expected, needs: [] }
  }
  const built = buildHelperValue(helper)
  const locals = new Map<string, string>()
  const needs: string[] = []
  for (const name of built.imports) {
    const bound = localBinding(program, name)
    locals.set(name, bound ?? name)
    if (bound === undefined) {
      needs.push(name)
    }
  }
  const rendered = renderExpression(built.value, style, { ...layout, locals })
  return { edit, text: rendered, form: 'helper', expression: { value: built.value, locals }, needs }
}

/** The first array or object literal in `node`, itself included, in source order. */
function firstList (node: Node): TSESTree.ArrayExpression | TSESTree.ObjectExpression | undefined {
  for (const inner of walk(node)) {
    if (inner.type === 'ArrayExpression' || inner.type === 'ObjectExpression') {
      return inner
    }
  }
  return undefined
}
