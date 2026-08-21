import semver from 'semver'

/**
 * A parsed `bundle.packages.embed` entry: a package name — or a name
 * pattern with `*` wildcards — with an optional exact version pin
 * (`name` or `name@version`).
 */
export interface EmbeddedPackageSpec {
  /** The raw config entry, kept for error messages. */
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
}

/**
 * Whether a spec selects the given package name: exact comparison for
 * plain specs, pattern match for wildcard specs.
 */
export function specMatchesPackageName (spec: EmbeddedPackageSpec, packageName: string): boolean {
  if (spec.namePattern !== undefined) {
    return spec.namePattern.test(packageName)
  }
  return spec.name === packageName
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
 * Parses a `bundle.packages.embed` entry into a package name and an
 * optional exact version pin.
 *
 * Accepts `name` (embed every lockfile version of the package) and
 * `name@version` with an exact semver version. The name may contain `*`
 * wildcards (`@acme/*`, `acme-*`, `@acme/*-utils`), each matching any run
 * of characters except `/`. Version ranges are rejected: the embedded
 * tarball must be the exact artifact the lockfile resolved, so a range has
 * nothing meaningful to select against. A leading `v` is stripped, but the
 * version is otherwise kept as written (including any build metadata) so
 * it compares exactly against lockfile versions.
 */
export function parseEmbeddedPackageSpec (raw: string): EmbeddedPackageSpec {
  if (typeof raw !== 'string' || raw === '') {
    throw new InvalidEmbeddedPackageSpecError(String(raw), `must be a non-empty string`)
  }

  // A version separator is any `@` past the first character, which keeps the
  // scope marker of `@scope/name` intact.
  const versionSeparator = raw.lastIndexOf('@')
  const name = versionSeparator > 0 ? raw.slice(0, versionSeparator) : raw
  const rawVersion = versionSeparator > 0 ? raw.slice(versionSeparator + 1) : undefined

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
    return { raw, name, namePattern }
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

  return { raw, name, version, namePattern }
}
