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
   * {@link namePattern} is set, the raw name pattern, e.g. `@acme/*`.
   */
  name: string
  /** The exact pinned version, if the entry included one. */
  version?: string
  /**
   * Present when the name contains `*` wildcards: the compiled matcher.
   * Each `*` matches any run of characters except `/`, so a wildcard
   * never crosses the scope separator (`@acme/*` matches only packages in
   * that scope; a bare `*` matches only unscoped names).
   */
  namePattern?: RegExp
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
  if (spec.namePattern !== undefined) {
    return spec.namePattern.test(packageName)
  }
  return spec.name === packageName
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

function compileNamePattern (name: string): RegExp {
  // Splitting on *runs* of `*` treats consecutive stars as one, keeping
  // the compiled regex free of adjacent `[^/]*` runs, whose backtracking
  // on a mismatch grows catastrophically with the number of stars.
  const escaped = name
    .split(/\*+/)
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*')
  return new RegExp(`^${escaped}$`)
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
  const namePattern = wildcard ? compileNamePattern(name) : undefined

  if (rawVersion === undefined) {
    return { raw, name, namePattern, exclude }
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

  return { raw, name, version, namePattern, exclude }
}

/**
 * A parsed package name pattern: a plain package name, or a name pattern
 * with `*` wildcards — the name-matching subset of
 * {@link EmbeddedPackageSpec}, without the version pin and `!` exclusion.
 * See the spec's field docs for the wildcard semantics.
 */
export type PackageNamePattern = Pick<EmbeddedPackageSpec, 'name' | 'namePattern'>

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
 * separator, and a bare `*` matches only unscoped names. Unlike
 * {@link parseEmbeddedPackageSpec} there are no `name@version` pins and no
 * `!` exclusions; both are rejected with a pointed message so an
 * embed-style entry fails loudly instead of silently matching nothing.
 */
export function parsePackageNamePattern (raw: string): PackageNamePattern {
  if (typeof raw !== 'string' || raw === '') {
    throw new InvalidPackageNamePatternError(String(raw), `must be a non-empty string`)
  }

  if (raw.startsWith('!')) {
    throw new InvalidPackageNamePatternError(
      raw,
      `'!' exclusions are not supported here; list the names to remove instead`,
    )
  }

  // Any `@` past the first character would be an embed-style version
  // separator; the one at index 0 is the scope marker of `@scope/name`.
  if (raw.lastIndexOf('@') > 0) {
    throw new InvalidPackageNamePatternError(raw, `'name@version' pins are not supported here`)
  }

  const wildcard = raw.includes('*')
  if (!PACKAGE_NAME_RE.test(wildcard ? raw.replace(/\*/g, 'a') : raw)) {
    throw new InvalidPackageNamePatternError(
      raw,
      `'${raw}' is not a valid npm package name${wildcard ? ' pattern' : ''}`,
    )
  }

  return {
    name: raw,
    namePattern: wildcard ? compileNamePattern(raw) : undefined,
  }
}
