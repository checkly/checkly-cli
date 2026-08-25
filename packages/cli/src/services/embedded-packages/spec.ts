import semver from 'semver'

/**
 * A parsed `bundle.packages.embed` entry: a package name — or a name
 * pattern with `*` wildcards — with an optional exact version pin
 * (`name` or `name@version`), optionally prefixed with `!` to make it an
 * exclusion.
 */
export interface EmbeddedPackageSpec {
  /** The raw config entry, `!` prefix included, kept for error messages. */
  raw: string
  /**
   * The package name, e.g. `@acme/private-utils` — or, when
   * {@link wildcard} is set, the raw name pattern, e.g. `@acme/*`.
   */
  name: string
  /** The exact pinned version, if the entry included one. */
  version?: string
  /**
   * True when the name contains `*` wildcards and matches as a pattern
   * rather than by exact comparison. Each `*` matches any run of
   * characters except `/`, so a wildcard never crosses the scope
   * separator (`@acme/*` matches only packages in that scope; a bare `*`
   * matches only unscoped names).
   */
  wildcard: boolean
  /**
   * True when the entry was prefixed with `!`: instead of selecting
   * packages, it removes the ones it matches from what the entries before
   * it selected.
   */
  exclude: boolean
}

/** The parts of a lockfile entry a spec is matched against. */
export interface PackageRef {
  name: string
  /**
   * Absent on entries the lockfile records without one, e.g. git, file and
   * URL resolutions and workspace links.
   */
  version?: string
}

/**
 * Whether a spec selects the given package name: exact comparison for
 * plain specs, pattern match for wildcard specs.
 */
export function specMatchesPackageName (
  spec: PackageNamePattern,
  packageName: string,
): boolean {
  if (spec.wildcard) {
    return matchesNamePattern(spec.name, packageName)
  }
  return spec.name === packageName
}

/**
 * Whether an ordered pattern list selects the given name: a matching
 * plain entry selects it, a matching `!` exclusion deselects it, and the
 * last matching entry wins. This is the canonical definition of the
 * order-sensitive exclusion rule both `bundle.packages` options share
 * (`['@acme/*', '!@acme/keep']` selects the scope except `@acme/keep`,
 * while the reverse order selects the whole scope because the exclusion
 * ran before anything was selected); the embed materializer applies the
 * same rule per spec so it can attribute diagnostics to entries.
 */
export function patternsSelectName (patterns: PackageNamePattern[], name: string): boolean {
  let selected = false
  for (const pattern of patterns) {
    if (specMatchesPackageName(pattern, name)) {
      selected = !pattern.exclude
    }
  }
  return selected
}

/**
 * Whether a spec selects the given package: the name must match, and so
 * must an exact version pin. An entry the lockfile records without a
 * version never satisfies a pin.
 */
export function specMatchesPackage (spec: EmbeddedPackageSpec, entry: PackageRef): boolean {
  return specMatchesPackageName(spec, entry.name)
    && (spec.version === undefined || entry.version === spec.version)
}

/**
 * As {@link specMatchesPackage}, except that a version-less entry matches
 * any pin. Used where such an entry is still worth reporting against a
 * pinned spec: a git resolution or a workspace link may well be the package
 * the user meant, recorded in a form that has no version to compare.
 */
export function specLooselyMatchesPackage (spec: EmbeddedPackageSpec, entry: PackageRef): boolean {
  return specMatchesPackageName(spec, entry.name)
    && (spec.version === undefined || entry.version === undefined || entry.version === spec.version)
}

/**
 * Matches a wildcard name pattern against a package name, without a
 * regex: a regex spelling each `*` as `[^/]*` backtracks catastrophically
 * on a mismatch once several stars are separated by literals (measured in
 * the minutes for a dozen stars against a 50-character name), and the
 * pattern comes straight from the user's config. Since a wildcard never
 * crosses `/`, the pattern and the name are split on `/` and must agree
 * on segment count; within a segment, `*` matches any run of characters
 * via the classic greedy two-pointer walk, which retries at most one
 * star at a time and runs in O(pattern length × name length).
 */
function matchesNamePattern (pattern: string, packageName: string): boolean {
  const patternSegments = pattern.split('/')
  const nameSegments = packageName.split('/')
  if (nameSegments.length !== patternSegments.length) {
    return false
  }
  return patternSegments.every((segment, i) => segmentMatches(segment, nameSegments[i]))
}

/** Greedy single-segment wildcard match: `*` matches any run of characters. */
function segmentMatches (pattern: string, text: string): boolean {
  let p = 0
  let t = 0
  let starP = -1
  let starT = 0
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === '*') {
      // Tentatively match the star to the empty run; remember where to
      // widen it if the rest of the pattern fails.
      starP = p
      starT = t
      p++
    } else if (p < pattern.length && pattern[p] === text[t]) {
      p++
      t++
    } else if (starP !== -1) {
      // Widen the most recent star by one character and retry after it.
      starT++
      t = starT
      p = starP + 1
    } else {
      return false
    }
  }
  while (p < pattern.length && pattern[p] === '*') {
    p++
  }
  return p === pattern.length
}

// npm's name rules for already-published packages: new publishes must be
// lowercase, but plenty of legitimate older packages (JSONStream) contain
// uppercase letters, so both cases are accepted. Leading `.` and `_` stay
// disallowed, as npm has never permitted them.
const PACKAGE_NAME_RE = /^(@[a-zA-Z0-9-~][a-zA-Z0-9-~._]*\/)?[a-zA-Z0-9-~][a-zA-Z0-9-._~]*$/

export class InvalidEmbeddedPackageSpecError extends Error {
  /** The failure alone, without the `Invalid embedded package '<spec>':` prefix. */
  readonly reason: string

  constructor (spec: string, reason: string) {
    super(`Invalid embedded package '${spec}': ${reason}`)
    this.name = 'InvalidEmbeddedPackageSpecError'
    this.reason = reason
  }
}

/**
 * Parses a `bundle.packages.embed` entry into a package name, an optional
 * exact version pin and whether the entry excludes rather than selects.
 *
 * Accepts `name` (embed every lockfile version of the package) and
 * `name@version` with an exact semver version. The name may contain `*`
 * wildcards (`@acme/*`, `acme-*`, `@acme/*-utils`), each matching any run
 * of characters except `/`. A `!` prefix (`!@acme/legacy`, `!@acme/*`,
 * `!legacy@2.1.0`) marks the entry as an exclusion, subtracting from what
 * the entries before it selected. Version ranges are rejected: the
 * embedded tarball must be the exact artifact the lockfile resolved, so a
 * range has nothing meaningful to select against. A leading `v` is
 * stripped, but the version is otherwise kept as written (including any
 * build metadata) so it compares exactly against lockfile versions.
 */
export function parseEmbeddedPackageSpec (raw: string): EmbeddedPackageSpec {
  if (typeof raw !== 'string' || raw === '') {
    throw new InvalidEmbeddedPackageSpecError(String(raw), `must be a non-empty string`)
  }

  // The `!` has to come off before anything else is read: on the raw
  // `!@acme/foo` the version separator below would land on the scope marker
  // at index 1 and parse the entry as name `!` at version `acme/foo`.
  const exclude = raw.startsWith('!')
  const pattern = exclude ? raw.slice(1) : raw
  if (pattern === '') {
    throw new InvalidEmbeddedPackageSpecError(raw, `must name a package or pattern after '!'`)
  }

  // A version separator is any `@` past the first character, which keeps the
  // scope marker of `@scope/name` intact.
  const versionSeparator = pattern.lastIndexOf('@')
  const name = versionSeparator > 0 ? pattern.slice(0, versionSeparator) : pattern
  const rawVersion = versionSeparator > 0 ? pattern.slice(versionSeparator + 1) : undefined

  // A wildcard name must still be name-shaped once every `*` stands in for
  // name characters. (`*` itself appears in npm's legacy name charset, but
  // no real-world package uses it; here it always means a wildcard.)
  const wildcard = name.includes('*')
  if (!PACKAGE_NAME_RE.test(wildcard ? name.replace(/\*/g, 'a') : name)) {
    throw new InvalidEmbeddedPackageSpecError(
      raw,
      `'${name}' is not a valid npm package name${wildcard ? ' pattern' : ''}`,
    )
  }

  if (rawVersion === undefined) {
    return { raw, name, wildcard, exclude }
  }

  // Trim before validating: semver.valid() tolerates surrounding whitespace,
  // so an untrimmed version would pass validation yet never compare equal to
  // a lockfile version.
  const trimmedVersion = rawVersion.trim()
  const version = trimmedVersion.startsWith('v') ? trimmedVersion.slice(1) : trimmedVersion
  if (semver.valid(version) === null) {
    throw new InvalidEmbeddedPackageSpecError(
      raw,
      `'${rawVersion}' is not an exact semver version (use 'name' or 'name@1.2.3')`,
    )
  }

  return { raw, name, version, wildcard, exclude }
}

/**
 * A parsed package name pattern: a plain package name, or a name pattern
 * with `*` wildcards, optionally prefixed with `!` to make it an
 * exclusion — the name-matching subset of {@link EmbeddedPackageSpec},
 * without the version pin. See the spec's field docs for the wildcard
 * and exclusion semantics.
 */
export type PackageNamePattern = Pick<EmbeddedPackageSpec, 'name' | 'wildcard' | 'exclude'>

export class InvalidPackageNamePatternError extends Error {
  constructor (raw: string, reason: string) {
    super(`Invalid package name pattern '${raw}': ${reason}`)
    this.name = 'InvalidPackageNamePatternError'
  }
}

/**
 * Parses a package name pattern: a package name that may contain `*`
 * wildcards (`@acme/*`, `acme-*`, `@acme/*-utils`), each matching any run
 * of characters except `/` — so a wildcard never crosses the scope
 * separator, and a bare `*` matches only unscoped names. A `!` prefix
 * marks the entry as an exclusion, subtracting from what the entries
 * before it selected, exactly as in `bundle.packages.embed`. Unlike
 * {@link parseEmbeddedPackageSpec} there are no `name@version` pins;
 * they are rejected with a pointed message so an embed-style pin fails
 * loudly instead of silently matching nothing.
 */
export function parsePackageNamePattern (raw: string): PackageNamePattern {
  // The pin rejection must run before the delegation below, which would
  // otherwise accept `name@version` the way embed does. The `!` comes off
  // first so the scope marker of `!@scope/name` at index 1 is not read as
  // a version separator; any `@` past the first character of what remains
  // would be one.
  if (typeof raw === 'string' && raw.replace(/^!/, '').lastIndexOf('@') > 0) {
    throw new InvalidPackageNamePatternError(raw, `'name@version' pins are not supported here`)
  }

  try {
    const { name, wildcard, exclude } = parseEmbeddedPackageSpec(raw)
    return { name, wildcard, exclude }
  } catch (err) {
    if (err instanceof InvalidEmbeddedPackageSpecError) {
      throw new InvalidPackageNamePatternError(String(raw), err.reason)
    }
    throw err
  }
}
