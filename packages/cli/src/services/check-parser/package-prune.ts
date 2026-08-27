import { isDeepStrictEqual } from 'node:util'

import Debug from 'debug'

import { quotedList } from '../embedded-packages/diagnostics.js'
import {
  PackageNamePattern,
  parsePackageNamePattern,
  patternsSelectName,
  specMatchesPackageName,
} from '../embedded-packages/spec.js'

const debug = Debug('checkly:cli:services:check-parser:package-prune')

export const DEPENDENCY_CLASSES = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

export type DependencyClass = typeof DEPENDENCY_CLASSES[number]

/**
 * A per-class map: `true` selects the whole class and a pattern array
 * selects matching entries from it.
 */
export type BundlePackagesPruneClasses = {
  [K in DependencyClass]?: true | string[]
}

/**
 * A `bundle.packages.prune` array entry: a global name pattern applied to
 * every bundled workspace manifest, or a member-scoped object targeting
 * the manifests whose `name` the `member` pattern list selects (`'.'`
 * addresses the workspace root). A scoped entry carries exactly one of
 * `remove` (subtractive: matching entries are removed, composing with
 * global patterns in listed order) or `keep` (declarative: the member's
 * entire final dependency set — entries not kept are removed, classes a
 * class-keyed `keep` leaves unmentioned are emptied, and no other entry
 * can remove a kept name).
 */
export type BundlePackagesPruneEntry =
  | string
  | {
    member: string | string[]
    remove: string[] | BundlePackagesPruneClasses
    keep?: never
  }
  | {
    member: string | string[]
    keep: string[] | BundlePackagesPruneClasses
    remove?: never
  }

/**
 * The `bundle.packages.prune` config surface: an entry array (name
 * patterns and member-scoped objects), or a per-class map where `true`
 * removes the whole class and a pattern array removes matching entries
 * from it.
 */
export type BundlePackagesPrune =
  | BundlePackagesPruneEntry[]
  | BundlePackagesPruneClasses

/**
 * A member selector element: the `'.'` token addressing the workspace
 * root, or a name pattern matched against a member manifest's `name`.
 */
export type MemberPattern =
  | { root: true, exclude: boolean }
  | PackageNamePattern

/** Parsed patterns per dependency class; an absent class holds none. */
export type PruneClassPatterns = {
  [K in DependencyClass]?: PackageNamePattern[]
}

/**
 * A normalized prune entry. `true` class values inside member-scoped
 * `remove`/`keep` normalize to the catch-all `'**'` pattern, so ordered
 * entry composition needs no separate whole-class rule — unlike the
 * standalone class-keyed form, whose `true` keeps its structural extras
 * (see {@link applyPrune}). `flat` records that a `keep` was written as
 * one pattern list rather than keyed by class.
 */
export type NormalizedPruneEntry =
  | { kind: 'global', pattern: PackageNamePattern }
  | { kind: 'remove', member: MemberPattern[], remove: PruneClassPatterns }
  | { kind: 'keep', member: MemberPattern[], keep: PruneClassPatterns, flat: boolean }

/**
 * Normalized form: the entry array becomes an ordered entry list, the
 * class-keyed map stays per class — `true` (remove all) or parsed
 * patterns, with an absent class left untouched. Application always goes
 * through {@link resolveManifestPrune} first, which reduces either form
 * to what applies to one concrete manifest.
 */
export type NormalizedPackagePrune =
  | { form: 'entries', entries: NormalizedPruneEntry[] }
  | { form: 'classes', classes: { [K in DependencyClass]?: true | PackageNamePattern[] } }

const SHAPE_ERROR = `must be an array of package name patterns or an object keyed by dependency class.`

const ENTRY_SHAPE_ERROR = `each entry must be a package name pattern`
  + ` or a member-scoped object with 'member' and one of 'remove' or 'keep'.`

const CATCH_ALL_PATTERN = parsePackageNamePattern('**')

function isPlainObject (value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  // A non-plain object (a Set, a Map, a Date) has no own enumerable
  // string keys, so without this check it would silently normalize to
  // "nothing to do" instead of being rejected.
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Walks a `bundle.packages.prune` value, reporting every issue through
 * `onIssue` so that all of them surface in a single run — the config
 * loader turns each one into its own diagnostic. Member-scoped entry
 * issues are prefixed with the entry's index and class-keyed pattern
 * issues with the dependency class; a top-level global pattern issue
 * keeps its `InvalidPackageNamePatternError` class and message as-is,
 * since the pattern text identifies the entry.
 */
export function collectPackagePruneIssues (
  raw: BundlePackagesPrune | undefined,
  onIssue: (issue: Error) => void,
): void {
  normalizePackagePruneInternal(raw, onIssue)
}

/**
 * Validates and normalizes a `bundle.packages.prune` value. Returns
 * `undefined` when there is nothing to do — the value is absent, or every
 * shape it carries is empty. Throws the first issue found; the bundler
 * relies on that to reject a value that bypassed config validation.
 */
export function normalizePackagePrune (raw: BundlePackagesPrune | undefined): NormalizedPackagePrune | undefined {
  let firstIssue: Error | undefined
  const normalized = normalizePackagePruneInternal(raw, issue => {
    firstIssue ??= issue
  })
  if (firstIssue !== undefined) {
    throw firstIssue
  }

  return normalized
}

function normalizePackagePruneInternal (
  raw: BundlePackagesPrune | undefined,
  onIssue: (issue: Error) => void,
): NormalizedPackagePrune | undefined {
  if (raw === undefined) {
    return undefined
  }

  if (Array.isArray(raw)) {
    const entries: NormalizedPruneEntry[] = []
    for (const [index, entry] of raw.entries()) {
      if (typeof entry === 'string') {
        try {
          entries.push({ kind: 'global', pattern: parsePackageNamePattern(entry) })
        } catch (cause) {
          onIssue(cause as Error)
        }
        continue
      }
      // The index prefix locates the issue: unlike a global pattern, whose
      // text appears in its own message, several member-scoped entries can
      // produce identical messages.
      const normalized = normalizeMemberScopedEntry(entry, issue => {
        onIssue(new Error(`[${index}]: ${issue.message}`, { cause: issue }))
      })
      if (normalized !== undefined) {
        entries.push(normalized)
      }
    }
    if (entries.length === 0) {
      return undefined
    }
    return { form: 'entries', entries }
  }

  if (!isPlainObject(raw)) {
    onIssue(new Error(SHAPE_ERROR))
    return undefined
  }
  const classes = normalizeClassMap(raw, false, onIssue)
  if (Object.keys(classes).length === 0) {
    return undefined
  }
  return { form: 'classes', classes }
}

/**
 * Parses a pattern-list value from the given context (a dependency class
 * or a member-scoped selection field), collecting an issue per invalid
 * element. A plain-object element gets a pointed rejection: the likely
 * mistake is a member-scoped entry nested inside a class-keyed map or
 * another entry's selection, which would otherwise fail as an unreadable
 * `'[object Object]' is not a valid pattern`. Anything else — arrays
 * included, which the hint would only misdirect — falls through to the
 * generic pattern error, prefixed with the context so the same bad
 * pattern in two places stays distinguishable. Returns `undefined` when
 * any element is invalid.
 */
function parsePatternArray (
  value: unknown[],
  context: string,
  onIssue: (issue: Error) => void,
): PackageNamePattern[] | undefined {
  const patterns: PackageNamePattern[] = []
  for (const entry of value) {
    if (isPlainObject(entry)) {
      onIssue(new Error(
        `'${context}' entries must be package name patterns`
        + ` (member-scoped objects are only valid in the top-level prune array).`,
      ))
      continue
    }
    try {
      patterns.push(parsePackageNamePattern(entry as string))
    } catch (cause) {
      onIssue(new Error(`'${context}': ${(cause as Error).message}`, { cause }))
    }
  }

  // Each element contributed either a pattern or an issue, so a shorter
  // patterns list means some element was invalid.
  if (patterns.length !== value.length) {
    return undefined
  }

  return patterns
}

/**
 * Validates and normalizes a class-keyed pattern map, collecting an issue
 * per invalid class or pattern. `true` values are kept as `true` for the
 * standalone class-keyed form and desugared to the catch-all `'**'`
 * pattern inside member-scoped entries, where selections compose in
 * listed order and a later exclusion may subtract from them. A class that
 * carries an issue is left out of the result.
 */
function normalizeClassMap (
  perClass: Record<string, unknown>,
  desugarTrue: boolean,
  onIssue: (issue: Error) => void,
): { [K in DependencyClass]?: true | PackageNamePattern[] } {
  const normalized: { [K in DependencyClass]?: true | PackageNamePattern[] } = {}
  for (const [key, value] of Object.entries(perClass)) {
    if (!DEPENDENCY_CLASSES.includes(key as DependencyClass)) {
      onIssue(new Error(
        `'${key}' is not a dependency class (expected one of ${DEPENDENCY_CLASSES.join(', ')}).`,
      ))
      continue
    }
    if (value === undefined) {
      continue
    }
    if (value === true) {
      normalized[key as DependencyClass] = desugarTrue ? [CATCH_ALL_PATTERN] : true
      continue
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue
      }
      // Parsed per class even for the array shape, so no two classes share
      // one pattern array instance and a consumer mutating one cannot
      // silently change the others.
      const patterns = parsePatternArray(value, key, onIssue)
      if (patterns !== undefined) {
        normalized[key as DependencyClass] = patterns
      }
      continue
    }
    onIssue(new Error(`'${key}' must be true or an array of package name patterns.`))
  }
  return normalized
}

/**
 * Normalizes a member-scoped `remove`/`keep` value: a flat pattern list
 * fans out to every dependency class, a class-keyed map stays per class.
 * For `keep`, an absent class means "keep nothing from it" — so an empty
 * flat list or map legitimately describes a member kept dependency-free.
 * Returns `undefined` when the value carries any issue.
 */
function normalizeSelection (
  value: unknown,
  field: 'remove' | 'keep',
  onIssue: (issue: Error) => void,
): PruneClassPatterns | undefined {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return {}
    }
    const patterns = parsePatternArray(value, field, onIssue)
    if (patterns === undefined) {
      return undefined
    }
    return Object.fromEntries(
      DEPENDENCY_CLASSES.map(dependencyClass => [dependencyClass, patterns.slice()]),
    ) as PruneClassPatterns
  }
  if (isPlainObject(value)) {
    let invalid = false
    // With `true` desugared no `true` values remain, only pattern arrays.
    const classes = normalizeClassMap(value, true, issue => {
      invalid = true
      onIssue(issue)
    }) as PruneClassPatterns
    return invalid ? undefined : classes
  }
  onIssue(new Error(`'${field}' ${SHAPE_ERROR}`))
  return undefined
}

function normalizeMemberPatterns (
  raw: unknown,
  onIssue: (issue: Error) => void,
): MemberPattern[] | undefined {
  const list = typeof raw === 'string' ? [raw] : raw
  if (!Array.isArray(list) || list.length === 0) {
    onIssue(new Error(`'member' must be a workspace member name pattern or a non-empty array of them.`))
    return undefined
  }
  const patterns: MemberPattern[] = []
  for (const element of list) {
    if (element === '.' || element === '!.') {
      patterns.push({ root: true, exclude: element === '!.' })
      continue
    }
    if (element !== null && typeof element === 'object') {
      onIssue(new Error(`'member' entries must be member name patterns or the '.' root token.`))
      continue
    }
    try {
      patterns.push(parsePackageNamePattern(element as string))
    } catch (cause) {
      onIssue(new Error(`'member': ${(cause as Error).message}`, { cause }))
    }
  }
  if (patterns.length !== list.length) {
    return undefined
  }
  return patterns
}

/**
 * Normalizes one member-scoped entry, collecting every independent issue
 * it carries — unknown fields, the member selector and the selection each
 * report separately. Returns `undefined` when the entry carries any
 * issue. With exactly-one-of-'remove'/'keep' violated the selection is
 * not validated further, since which selection was meant is unknowable.
 */
function normalizeMemberScopedEntry (
  entry: unknown,
  onIssue: (issue: Error) => void,
): NormalizedPruneEntry | undefined {
  if (!isPlainObject(entry)) {
    onIssue(new Error(ENTRY_SHAPE_ERROR))
    return undefined
  }
  let invalid = false
  const report = (issue: Error): void => {
    invalid = true
    onIssue(issue)
  }
  for (const key of Object.keys(entry)) {
    if (key !== 'member' && key !== 'remove' && key !== 'keep') {
      report(new Error(`'${key}' is not a member-scoped prune entry field (expected member, remove, keep).`))
    }
  }
  const member = normalizeMemberPatterns(entry.member, report)
  const hasRemove = entry.remove !== undefined
  const hasKeep = entry.keep !== undefined
  if (hasRemove === hasKeep) {
    report(new Error(`a member-scoped prune entry must have exactly one of 'remove' and 'keep'.`))
    return undefined
  }
  const selection = normalizeSelection(
    hasRemove ? entry.remove : entry.keep,
    hasRemove ? 'remove' : 'keep',
    report,
  )
  if (invalid || member === undefined || selection === undefined) {
    return undefined
  }
  if (hasRemove) {
    return { kind: 'remove', member, remove: selection }
  }
  return {
    kind: 'keep',
    member,
    keep: selection,
    flat: Array.isArray(entry.keep),
  }
}

/**
 * The identity a manifest is matched against when resolving member-scoped
 * prune entries.
 */
export interface PruneMemberIdentity {
  /**
   * The manifest's `name`. The `Package` type declares `name: string`,
   * but a workspace root's manifest legitimately ships without one and
   * some discovery paths let that `undefined` through — such a member is
   * matchable solely by the `'.'` token.
   */
  name?: string
  /** Whether this is the workspace root. */
  root: boolean
}

function memberPatternsSelect (patterns: MemberPattern[], member: PruneMemberIdentity): boolean {
  let selected = false
  for (const pattern of patterns) {
    const matches = 'root' in pattern
      ? member.root
      : typeof member.name === 'string' && member.name !== ''
        && specMatchesPackageName(pattern, member.name)
    if (matches) {
      selected = !pattern.exclude
    }
  }
  return selected
}

/**
 * What a prune configuration does to one concrete manifest. In `remove`
 * mode each configured class holds `true` (standalone class-keyed form
 * only) or the combined ordered pattern list of every entry that applies
 * to this manifest. In `keep` mode the manifest's final dependency set is
 * the union of the matched `keep` selections and everything else is
 * removed — removals never apply to a keep-governed manifest, which is
 * what makes its outcome independent of entry order.
 */
export type ResolvedManifestPrune =
  | { mode: 'remove', classes: { [K in DependencyClass]?: true | PackageNamePattern[] } }
  | { mode: 'keep', keeps: PruneClassPatterns[] }

/**
 * Reduces a normalized prune to what applies to the given manifest:
 * global patterns and matching member-scoped `remove` selections combine
 * per class in listed order (so a later `!` exclusion subtracts from
 * earlier entries' selections), unless a `keep` entry matches the member,
 * in which case the keep selections govern alone. Returns `undefined`
 * when nothing targets the manifest.
 */
export function resolveManifestPrune (
  prune: NormalizedPackagePrune,
  member: PruneMemberIdentity,
): ResolvedManifestPrune | undefined {
  if (prune.form === 'classes') {
    return { mode: 'remove', classes: prune.classes }
  }

  const keeps: PruneClassPatterns[] = []
  for (const entry of prune.entries) {
    if (entry.kind === 'keep' && memberPatternsSelect(entry.member, member)) {
      keeps.push(entry.keep)
    }
  }
  if (keeps.length > 0) {
    return { mode: 'keep', keeps }
  }

  const classes: PruneClassPatterns = {}
  const append = (dependencyClass: DependencyClass, patterns: PackageNamePattern[]): void => {
    (classes[dependencyClass] ??= []).push(...patterns)
  }
  for (const entry of prune.entries) {
    if (entry.kind === 'global') {
      for (const dependencyClass of DEPENDENCY_CLASSES) {
        append(dependencyClass, [entry.pattern])
      }
      continue
    }
    if (entry.kind === 'remove' && memberPatternsSelect(entry.member, member)) {
      for (const dependencyClass of DEPENDENCY_CLASSES) {
        const patterns = entry.remove[dependencyClass]
        if (patterns !== undefined) {
          append(dependencyClass, patterns)
        }
      }
    }
  }
  if (Object.keys(classes).length === 0) {
    return undefined
  }
  return { mode: 'remove', classes }
}

type ScopedPruneEntry = Exclude<NormalizedPruneEntry, { kind: 'global' }>

/** Formats a member pattern back to its config spelling. */
function formatMemberPattern (pattern: MemberPattern): string {
  return `${pattern.exclude ? '!' : ''}${'root' in pattern ? '.' : pattern.name}`
}

/**
 * How a member is named in warnings. Only the root can lack a `name` at
 * runtime (see {@link PruneMemberIdentity.name}), so its token stands in.
 */
function displayMemberName (member: PruneMemberIdentity): string {
  return member.name ?? '.'
}

/**
 * Whether the pattern contributes anything to the manifest's kept set:
 * some entry in one of the given classes both matches the pattern and is
 * ultimately retained — judged against the union of every keep entry
 * matching the member, exactly what {@link applyPrune} keeps. Judged
 * against retention rather than the raw match so a keep list whose later
 * `!` exclusions cancel everything a pattern selected still reports
 * (that silent gutting is exactly what this net exists to catch), while
 * a name another matching keep entry rescues does not.
 */
function patternReaches (
  pattern: PackageNamePattern,
  keeps: PruneClassPatterns[],
  parsed: any,
  dependencyClasses: readonly DependencyClass[],
): boolean {
  return dependencyClasses.some(dependencyClass => {
    const section = parsed[dependencyClass]
    return isPlainSection(section) && Object.keys(section).some(name =>
      specMatchesPackageName(pattern, name) && keepsSelectName(keeps, dependencyClass, name))
  })
}

/**
 * Lints member-scoped prune entries. Two nets, both warnings rather than
 * errors because a pattern reaching nothing is legal in every other
 * `bundle.packages` position: a `member` selector matching no workspace
 * member at all (typo net), and a `keep` pattern selecting nothing in a
 * matched bundled member (the auto-enrollment net — a member swept in by
 * a wildcard later almost never declares another member's keep set, so
 * the gutting self-reports on the next run; a right name in the wrong
 * class reports the same way). The typo net is judged against the whole
 * discovered workspace, not the bundle: which members land in a bundle
 * varies per run with the check filter (`checkly test --grep`, a single
 * `checkly pw-test` config), and a selector for a member the current run
 * merely did not bundle is not a typo — that state shows up in the debug
 * reach log instead. The keep net runs on the bundled physical manifests
 * only — faux shims carry no real dependency classes — and only on ones
 * the caller could read, so a symlinked or unreadable manifest's own
 * failure warns separately.
 */
export class MemberPruneDiagnostics {
  /** One record per scoped entry, in entry order. */
  #state: {
    entry: ScopedPruneEntry
    workspaceMatched: Set<string>
    bundledMatched: Set<string>
  }[] = []

  /**
   * Keep misses keyed by entry, place and pattern, accumulating the
   * missing members: a shared keep list over a wildcard selector then
   * warns once per pattern naming every member it missed, instead of
   * bursting one line per member on every run.
   */
  #keepMisses = new Map<string, { pattern: string, where: string, members: string[] }>()

  constructor (prune: NormalizedPackagePrune | undefined) {
    if (prune?.form === 'entries') {
      this.#state = prune.entries
        .filter(entry => entry.kind !== 'global')
        .map(entry => ({ entry, workspaceMatched: new Set<string>(), bundledMatched: new Set<string>() }))
    }
  }

  /**
   * Marks the scoped entries whose member selector selects this workspace
   * member, bundled or not — the input of the typo net.
   */
  observeWorkspaceMember (member: PruneMemberIdentity): void {
    for (const state of this.#state) {
      if (memberPatternsSelect(state.entry.member, member)) {
        state.workspaceMatched.add(displayMemberName(member))
      }
    }
  }

  /**
   * Marks the scoped entries whose member selector selects this bundled
   * physical manifest — the input of the debug reach log.
   */
  observeBundledMember (member: PruneMemberIdentity): void {
    for (const state of this.#state) {
      if (memberPatternsSelect(state.entry.member, member)) {
        state.bundledMatched.add(displayMemberName(member))
      }
    }
  }

  /** Checks matching keep selections against the manifest's contents. */
  observeManifestContent (member: PruneMemberIdentity, content: string): void {
    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      return
    }
    if (!isPlainSection(parsed)) {
      return
    }
    // Reach is judged against the union of every matching keep entry —
    // the member's actual retention — so an entry's pattern whose kept
    // names another entry supplies does not misreport.
    const matched: { index: number, entry: ScopedPruneEntry & { kind: 'keep' } }[] = []
    const keeps: PruneClassPatterns[] = []
    for (const [index, state] of this.#state.entries()) {
      if (state.entry.kind === 'keep' && memberPatternsSelect(state.entry.member, member)) {
        matched.push({ index, entry: state.entry })
        keeps.push(state.entry.keep)
      }
    }
    for (const { index, entry } of matched) {
      this.#checkKeepEntry(index, entry, keeps, member, parsed)
    }
  }

  #checkKeepEntry (
    entryIndex: number,
    entry: ScopedPruneEntry & { kind: 'keep' },
    keeps: PruneClassPatterns[],
    member: PruneMemberIdentity,
    parsed: any,
  ): void {
    const memberName = displayMemberName(member)
    const check = (patterns: PackageNamePattern[], classes: readonly DependencyClass[], where: string): void => {
      for (const pattern of patterns) {
        if (this.#exemptFromMatchCheck(pattern)) {
          continue
        }
        if (!patternReaches(pattern, keeps, parsed, classes)) {
          const key = `${entryIndex}\u0000${where}\u0000${pattern.name}`
          let miss = this.#keepMisses.get(key)
          if (miss === undefined) {
            this.#keepMisses.set(key, miss = { pattern: pattern.name, where, members: [] })
          }
          if (!miss.members.includes(memberName)) {
            miss.members.push(memberName)
          }
        }
      }
    }
    if (entry.flat) {
      // A flat list fans out to every class identically, so its patterns
      // are checked across all classes and warn once — a per-class report
      // would repeat every miss four times.
      check(entry.keep.dependencies ?? [], DEPENDENCY_CLASSES, 'any dependency class')
      return
    }
    for (const dependencyClass of DEPENDENCY_CLASSES) {
      check(entry.keep[dependencyClass] ?? [], [dependencyClass], dependencyClass)
    }
  }

  /**
   * Exclusions only subtract, so one deselecting nothing is benign — the
   * same rule embed applies. The bare catch-all is exempt too: it is what
   * `keep: { <class>: true }` desugars to, and "everything in an empty
   * class" matching nothing is not a signal worth a warning.
   */
  #exemptFromMatchCheck (pattern: PackageNamePattern): boolean {
    return pattern.exclude || pattern.name === '**'
  }

  #selector (entry: ScopedPruneEntry): string {
    return entry.member.map(formatMemberPattern).join(`', '`)
  }

  /**
   * Logs each scoped entry's resolved member set — workspace-wide and
   * within this run's bundle — mirroring embed's pattern reach logging.
   * This is also where "the selector is fine, the member just is not in
   * this bundle" is visible. A separate call rather than a side effect of
   * {@link MemberPruneDiagnostics.warnings}: a caller that gates or drops
   * the warnings must not silently lose the reach log, which is the tool
   * for answering the very question the warnings raise.
   */
  logMemberReach (): void {
    for (const { entry, workspaceMatched, bundledMatched } of this.#state) {
      debug(`Prune entry for member '${this.#selector(entry)}' matched workspace members:`
        + ` ${[...workspaceMatched].join(', ') || '(none)'};`
        + ` bundled: ${[...bundledMatched].join(', ') || '(none)'}`)
    }
  }

  /** The accumulated lint messages, without the `Warning:` prefix. */
  warnings (): string[] {
    const out: string[] = []
    for (const { entry, workspaceMatched } of this.#state) {
      if (workspaceMatched.size === 0) {
        out.push(
          `bundle.packages.prune entry for member '${this.#selector(entry)}'`
          + ` matched no workspace member`,
        )
      }
    }
    for (const { pattern, where, members } of this.#keepMisses.values()) {
      const consequence = members.length > 1
        ? 'their bundled manifests do not keep it'
        : 'its bundled manifest does not keep it'
      out.push(
        `bundle.packages.prune keep pattern '${pattern}' matched nothing`
        + ` in ${where} of ${quotedList(members)}; ${consequence}`,
      )
    }
    return out
  }
}

export interface PrunePackageJsonResult {
  content: string
  /**
   * `class:name` labels of removed entries. Can be empty while `changed`
   * is true: `peerDependencies: true` on a manifest with an empty peer
   * section, or with only `peerDependenciesMeta`, removes no entries but
   * still edits the manifest.
   */
  removed: string[]
  /** Whether `content` differs from the input. */
  changed: boolean
}

function isPlainSection (section: unknown): section is Record<string, unknown> {
  return section !== null && typeof section === 'object' && !Array.isArray(section)
}

/** Whether any of the matched keep selections keeps the given entry. */
function keepsSelectName (keeps: PruneClassPatterns[], dependencyClass: DependencyClass, name: string): boolean {
  return keeps.some(keep => {
    const patterns = keep[dependencyClass]
    return patterns !== undefined && patternsSelectName(patterns, name)
  })
}

/**
 * Deletes the class's entries the predicate selects, recording removals
 * as `class:name` labels. Carries the structural rules shared by both
 * prune modes: a removed peer takes its `peerDependenciesMeta` entry with
 * it, and a section or meta object emptied by these removals is deleted —
 * one that was already empty is none of this feature's business.
 */
function removeSelectedNames (
  parsed: any,
  dependencyClass: DependencyClass,
  selects: (name: string) => boolean,
  removed: string[],
): boolean {
  const section = parsed[dependencyClass]
  if (!isPlainSection(section)) {
    return false
  }
  let lost = false
  for (const name of Object.keys(section)) {
    if (!selects(name)) {
      continue
    }
    delete section[name]
    removed.push(`${dependencyClass}:${name}`)
    lost = true
    if (dependencyClass === 'peerDependencies') {
      const meta = parsed.peerDependenciesMeta
      if (isPlainSection(meta)) {
        delete meta[name]
      }
    }
  }
  if (lost && Object.keys(section).length === 0) {
    delete parsed[dependencyClass]
  }
  if (lost && dependencyClass === 'peerDependencies'
    && isPlainSection(parsed.peerDependenciesMeta)
    && Object.keys(parsed.peerDependenciesMeta).length === 0) {
    delete parsed.peerDependenciesMeta
  }
  return lost
}

/**
 * Deletes the pruned entries from a parsed manifest, recording removals as
 * `class:name` labels. The verification below replays the same edit from
 * those labels — independently of the pattern matching — so the two
 * functions must agree on the structural rules: a dependency class that is
 * not a plain object is never touched; `true` deletes the class (and, for
 * `peerDependencies`, the whole `peerDependenciesMeta`); a removed peer
 * takes its meta entry with it; and a section or meta object emptied by
 * these removals is deleted. In keep mode the selection inverts — an entry
 * no matched keep selects is removed — under the same structural rules.
 * `dependenciesMeta` is deliberately not followed: only the peer meta
 * matters for the auto-install-peers promotion this feature exists to
 * counter, and a dangling `dependenciesMeta` entry is inert for the
 * regenerated lockfile.
 */
function applyPrune (parsed: any, resolved: ResolvedManifestPrune): { removed: string[], changed: boolean } {
  const removed: string[] = []
  let changed = false

  for (const dependencyClass of DEPENDENCY_CLASSES) {
    if (resolved.mode === 'keep') {
      changed = removeSelectedNames(
        parsed,
        dependencyClass,
        name => !keepsSelectName(resolved.keeps, dependencyClass, name),
        removed,
      ) || changed
      continue
    }

    const matcher = resolved.classes[dependencyClass]
    if (matcher === undefined) {
      continue
    }

    if (matcher === true) {
      const section = parsed[dependencyClass]
      if (isPlainSection(section)) {
        for (const name of Object.keys(section)) {
          removed.push(`${dependencyClass}:${name}`)
        }
        delete parsed[dependencyClass]
        changed = true
      }
      // Meta without its peers is meaningless — with pnpm's
      // auto-install-peers a dangling optional marker is exactly the noise
      // this feature removes. Cleared even when the manifest has no
      // `peerDependencies` object at all.
      if (dependencyClass === 'peerDependencies' && 'peerDependenciesMeta' in parsed) {
        delete parsed.peerDependenciesMeta
        changed = true
      }
      continue
    }

    changed = removeSelectedNames(
      parsed,
      dependencyClass,
      name => patternsSelectName(matcher, name),
      removed,
    ) || changed
  }

  return { removed, changed }
}

/**
 * Applies a resolved per-manifest prune (see {@link resolveManifestPrune})
 * to a package.json's contents. Returns the rewritten content and the
 * removed entries, or `undefined` when the content cannot be parsed or the
 * rewrite fails verification — the caller ships the original in that case.
 * A prune that changes nothing returns the original content with
 * `changed: false`, so the caller can leave the bundle entry untouched.
 */
export function prunePackageJson (
  content: string,
  resolved: ResolvedManifestPrune,
): PrunePackageJsonResult | undefined {
  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    debug(`Could not parse package.json for pruning: ${err}`)
    return undefined
  }
  if (!isPlainSection(parsed)) {
    debug(`Refusing to prune a package.json that is not an object`)
    return undefined
  }

  const { removed, changed } = applyPrune(parsed, resolved)
  if (!changed) {
    return { content, removed, changed }
  }

  // Unlike a byte-preserving edit, this reformats the whole manifest. The
  // bundled copy is only ever an install input — nothing reads it back as
  // text — and matching the original's formatting would mean carrying a
  // JSON editor for no behavioral gain.
  const rewritten = JSON.stringify(parsed, null, 2)

  if (verifyPrunedManifest(content, rewritten, resolved, removed) === undefined) {
    return undefined
  }

  return { content: rewritten, removed, changed }
}

/**
 * Asserts that a prune rewrite changed nothing but the reported entries,
 * by replaying the deletion on a fresh parse of the original — from the
 * `class:name` labels rather than the pattern matching, with each label
 * additionally checked against the resolved prune — so a matcher that
 * deleted the wrong entry, deleted from a class the prune never
 * configured, deleted a keep-selected entry, or strayed outside the
 * dependency classes fails the comparison instead of shipping. The
 * verification is inherently per manifest — its inputs are one manifest's
 * original and rewrite — so the resolved model already carries any member
 * scoping and the labels need no member qualifier. The structural rules
 * (`true` deleting a class, emptied sections and meta dropping out) are
 * mirrored from applyPrune rather than independently derived, so only the
 * per-entry path carries independent evidence; a maintainer extending the
 * structural rules must extend both sides. What the comparison cannot see
 * is a field whose value is already altered by JSON.parse itself (an
 * integer beyond 2^53 loses precision on both sides alike); asymmetric
 * serialization loss (`1e999` parses to `Infinity` but stringifies as
 * `null`) does fail it. The patch filtering keeps an analogous
 * fail-closed verifier in patched-dependencies.ts (`verifyRewrite`);
 * hardening either against a manifest quirk likely applies to both.
 */
export function verifyPrunedManifest (
  original: string,
  rewritten: string,
  resolved: ResolvedManifestPrune,
  removed: string[],
): string | undefined {
  let expected: any
  let actual: any
  try {
    expected = JSON.parse(original)
    actual = JSON.parse(rewritten)
  } catch (err) {
    debug(`Could not reparse a pruned package.json for verification: ${err}`)
    return undefined
  }

  const classTrue = (dependencyClass: DependencyClass): boolean =>
    resolved.mode === 'remove' && resolved.classes[dependencyClass] === true

  // Whether the resolved prune selects the entry for removal. Only called
  // with the known dependency classes — the caller checks membership
  // first, so a label like `__proto__:x` fails closed instead of reading
  // a matcher off Object.prototype.
  const selectsRemoval = (dependencyClass: DependencyClass, name: string): boolean => {
    if (resolved.mode === 'keep') {
      return !keepsSelectName(resolved.keeps, dependencyClass, name)
    }
    const matcher = resolved.classes[dependencyClass]
    return matcher !== undefined && (matcher === true || patternsSelectName(matcher, name))
  }

  // Every reported removal must be one the configuration allows: its class
  // a known dependency class, and its name one the resolved prune selects.
  for (const label of removed) {
    const separator = label.indexOf(':')
    const dependencyClass = label.slice(0, separator) as DependencyClass
    const name = label.slice(separator + 1)
    if (!DEPENDENCY_CLASSES.includes(dependencyClass) || !selectsRemoval(dependencyClass, name)) {
      debug(`A pruned package.json removed '${label}', which the configuration does not select;`
        + ` leaving the bundle alone`)
      return undefined
    }
  }

  // Replay the removals from the labels. The structural rules mirror
  // applyPrune exactly; see its doc comment.
  const lostClasses = new Set<string>()
  let lostPeers = false
  for (const label of removed) {
    const separator = label.indexOf(':')
    const dependencyClass = label.slice(0, separator)
    const name = label.slice(separator + 1)
    const section = expected?.[dependencyClass]
    if (!isPlainSection(section)) {
      continue
    }
    delete section[name]
    lostClasses.add(dependencyClass)
    if (dependencyClass === 'peerDependencies' && !classTrue('peerDependencies')) {
      lostPeers = true
      const meta = expected.peerDependenciesMeta
      if (isPlainSection(meta)) {
        delete meta[name]
      }
    }
  }

  for (const dependencyClass of DEPENDENCY_CLASSES) {
    if (classTrue(dependencyClass)) {
      if (isPlainSection(expected[dependencyClass])) {
        delete expected[dependencyClass]
      }
      if (dependencyClass === 'peerDependencies') {
        delete expected.peerDependenciesMeta
      }
      continue
    }
    const section = expected[dependencyClass]
    if (lostClasses.has(dependencyClass) && isPlainSection(section) && Object.keys(section).length === 0) {
      delete expected[dependencyClass]
    }
  }

  if (lostPeers && isPlainSection(expected.peerDependenciesMeta)
    && Object.keys(expected.peerDependenciesMeta).length === 0) {
    delete expected.peerDependenciesMeta
  }

  if (!isDeepStrictEqual(expected, actual)) {
    debug('A pruned package.json did not match the expected structure; leaving the bundle alone')
    return undefined
  }

  return rewritten
}
