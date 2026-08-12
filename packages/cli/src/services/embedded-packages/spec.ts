import semver from 'semver'

/**
 * A parsed `checks.embeddedPackages` entry: a package name with an optional
 * exact version pin (`name` or `name@version`).
 */
export interface EmbeddedPackageSpec {
  /** The raw config entry, kept for error messages. */
  raw: string
  /** The package name, e.g. `@acme/private-utils`. */
  name: string
  /** The exact pinned version, if the entry included one. */
  version?: string
}

// npm's name rules for already-published packages: new publishes must be
// lowercase, but plenty of legitimate older packages (JSONStream) contain
// uppercase letters, so both cases are accepted. Leading `.` and `_` stay
// disallowed, as npm has never permitted them.
const PACKAGE_NAME_RE = /^(@[a-zA-Z0-9-*~][a-zA-Z0-9-*~._]*\/)?[a-zA-Z0-9-~][a-zA-Z0-9-._~]*$/

export class InvalidEmbeddedPackageSpecError extends Error {
  constructor (spec: string, reason: string) {
    super(`Invalid embedded package '${spec}': ${reason}`)
    this.name = 'InvalidEmbeddedPackageSpecError'
  }
}

/**
 * Parses a `checks.embeddedPackages` entry into a package name and an
 * optional exact version pin.
 *
 * Accepts `name` (embed every lockfile version of the package) and
 * `name@version` with an exact semver version. Version ranges are rejected:
 * the embedded tarball must be the exact artifact the lockfile resolved, so
 * a range has nothing meaningful to select against. A leading `v` is
 * stripped, but the version is otherwise kept as written (including any
 * build metadata) so it compares exactly against lockfile versions.
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

  if (!PACKAGE_NAME_RE.test(name)) {
    throw new InvalidEmbeddedPackageSpecError(raw, `'${name}' is not a valid npm package name`)
  }

  if (rawVersion === undefined) {
    return { raw, name }
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

  return { raw, name, version }
}
