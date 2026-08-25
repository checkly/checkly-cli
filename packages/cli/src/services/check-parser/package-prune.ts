import { isDeepStrictEqual } from 'node:util'

import Debug from 'debug'

import {
  PackageNamePattern,
  parsePackageNamePattern,
  patternsSelectName,
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
 * The `bundle.packages.prune` config surface: a pattern array applied to
 * every dependency class, or a per-class map where `true` removes the
 * whole class and a pattern array removes matching entries from it.
 */
export type BundlePackagesPrune =
  | string[]
  | { [K in DependencyClass]?: true | string[] }

/**
 * Normalized form: per class, `true` (remove all) or parsed patterns.
 * A class absent from the map is left untouched.
 */
export type NormalizedPackagePrune = {
  [K in DependencyClass]?: true | PackageNamePattern[]
}

const SHAPE_ERROR = `must be an array of package name patterns or an object keyed by dependency class`

/**
 * Validates and normalizes a `bundle.packages.prune` value. Returns
 * `undefined` when there is nothing to do — the value is absent, or every
 * shape it carries is empty. Throws `InvalidPackageNamePatternError` on an
 * invalid pattern and a plain `Error` on an invalid shape; the config
 * loader relies on that to reject plain-JS configs that bypass the
 * TypeScript type.
 */
export function normalizePackagePrune (raw: BundlePackagesPrune | undefined): NormalizedPackagePrune | undefined {
  if (raw === undefined) {
    return undefined
  }

  let perClass: Record<string, unknown>
  if (Array.isArray(raw)) {
    perClass = Object.fromEntries(DEPENDENCY_CLASSES.map(dependencyClass => [dependencyClass, raw]))
  } else if (raw !== null && typeof raw === 'object') {
    // A non-plain object (a Set, a Map, a Date) has no own enumerable
    // string keys, so without this check it would silently normalize to
    // "nothing to do" instead of being rejected.
    const proto = Object.getPrototypeOf(raw)
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(SHAPE_ERROR)
    }
    perClass = raw
  } else {
    throw new Error(SHAPE_ERROR)
  }

  const normalized: NormalizedPackagePrune = {}
  for (const [key, value] of Object.entries(perClass)) {
    if (!DEPENDENCY_CLASSES.includes(key as DependencyClass)) {
      throw new Error(
        `'${key}' is not a dependency class (expected one of ${DEPENDENCY_CLASSES.join(', ')})`,
      )
    }
    if (value === undefined) {
      continue
    }
    if (value === true) {
      normalized[key as DependencyClass] = true
      continue
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue
      }
      // Parsed per class even for the array shape, so no two classes share
      // one pattern array instance and a consumer mutating one cannot
      // silently change the others.
      normalized[key as DependencyClass] = value.map(entry => parsePackageNamePattern(entry as string))
      continue
    }
    throw new Error(`'${key}' must be true or an array of package name patterns`)
  }

  if (Object.keys(normalized).length === 0) {
    return undefined
  }

  return normalized
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

/**
 * Deletes the pruned entries from a parsed manifest, recording removals as
 * `class:name` labels. The verification below replays the same edit from
 * those labels — independently of the pattern matching — so the two
 * functions must agree on the structural rules: a dependency class that is
 * not a plain object is never touched; `true` deletes the class (and, for
 * `peerDependencies`, the whole `peerDependenciesMeta`); a removed peer
 * takes its meta entry with it; and a section or meta object emptied by
 * these removals is deleted. `dependenciesMeta` is deliberately not
 * followed: only the peer meta matters for the auto-install-peers
 * promotion this feature exists to counter, and a dangling
 * `dependenciesMeta` entry is inert for the regenerated lockfile.
 */
function applyPrune (parsed: any, prune: NormalizedPackagePrune): { removed: string[], changed: boolean } {
  const removed: string[] = []
  let changed = false

  for (const dependencyClass of DEPENDENCY_CLASSES) {
    const matcher = prune[dependencyClass]
    if (matcher === undefined) {
      continue
    }

    const section = parsed[dependencyClass]

    if (matcher === true) {
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

    if (!isPlainSection(section)) {
      continue
    }

    let lost = false
    for (const name of Object.keys(section)) {
      if (!patternsSelectName(matcher, name)) {
        continue
      }
      delete section[name]
      removed.push(`${dependencyClass}:${name}`)
      changed = true
      lost = true
      if (dependencyClass === 'peerDependencies') {
        const meta = parsed.peerDependenciesMeta
        if (isPlainSection(meta)) {
          delete meta[name]
        }
      }
    }
    // Only a section (or meta object) this pass emptied is dropped; one
    // that was already empty is none of this feature's business.
    if (lost && Object.keys(section).length === 0) {
      delete parsed[dependencyClass]
    }
    if (lost && dependencyClass === 'peerDependencies'
      && isPlainSection(parsed.peerDependenciesMeta)
      && Object.keys(parsed.peerDependenciesMeta).length === 0) {
      delete parsed.peerDependenciesMeta
    }
  }

  return { removed, changed }
}

/**
 * Applies a normalized `bundle.packages.prune` to a package.json's
 * contents. Returns the rewritten content and the removed entries, or
 * `undefined` when the content cannot be parsed or the rewrite fails
 * verification — the caller ships the original in that case. A prune that
 * changes nothing returns the original content with `changed: false`, so
 * the caller can leave the bundle entry untouched.
 */
export function prunePackageJson (
  content: string,
  prune: NormalizedPackagePrune,
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

  const { removed, changed } = applyPrune(parsed, prune)
  if (!changed) {
    return { content, removed, changed }
  }

  // Unlike a byte-preserving edit, this reformats the whole manifest. The
  // bundled copy is only ever an install input — nothing reads it back as
  // text — and matching the original's formatting would mean carrying a
  // JSON editor for no behavioral gain.
  const rewritten = JSON.stringify(parsed, null, 2)

  if (verifyPrunedManifest(content, rewritten, prune, removed) === undefined) {
    return undefined
  }

  return { content: rewritten, removed, changed }
}

/**
 * Asserts that a prune rewrite changed nothing but the reported entries,
 * by replaying the deletion on a fresh parse of the original — from the
 * `class:name` labels rather than the pattern matching, with each label
 * additionally checked against the configured prune — so a matcher that
 * deleted the wrong entry, deleted from a class the prune never
 * configured, or strayed outside the dependency classes fails the
 * comparison instead of shipping. The structural rules (`true` deleting a
 * class, emptied sections and meta dropping out) are mirrored from
 * applyPrune rather than independently derived, so only the per-entry
 * path carries independent evidence; a maintainer extending the
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
  prune: NormalizedPackagePrune,
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

  // Every reported removal must be one the configuration allows: its class
  // a known dependency class the prune configured, and its name selected
  // by `true` or a configured pattern. The class-membership check comes
  // first so a label like `__proto__:x` fails closed instead of reading a
  // matcher off Object.prototype.
  for (const label of removed) {
    const separator = label.indexOf(':')
    const dependencyClass = label.slice(0, separator) as DependencyClass
    const name = label.slice(separator + 1)
    const matcher = DEPENDENCY_CLASSES.includes(dependencyClass) ? prune[dependencyClass] : undefined
    if (matcher === undefined
      || (matcher !== true && !patternsSelectName(matcher, name))) {
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
    if (dependencyClass === 'peerDependencies' && prune.peerDependencies !== true) {
      lostPeers = true
      const meta = expected.peerDependenciesMeta
      if (isPlainSection(meta)) {
        delete meta[name]
      }
    }
  }

  for (const dependencyClass of DEPENDENCY_CLASSES) {
    if (prune[dependencyClass] === true) {
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
