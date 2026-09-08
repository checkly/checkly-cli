/**
 * The two YAML documents pnpm may write into a single `pnpm-lock.yaml`.
 *
 * pnpm 12 records its own environment in a separate leading document when
 * `package.json` carries a `packageManager` field: the root importer's
 * `configDependencies` and `packageManagerDependencies`, plus the
 * `packages`/`snapshots` entries for pnpm's own binaries. It is placed before
 * the application document and separated from it by a YAML document marker:
 *
 *     ---
 *     lockfileVersion: '9.0'
 *     importers: { .: { packageManagerDependencies: { pnpm: ... } } }
 *     ---
 *     lockfileVersion: '9.0'
 *     importers: { .: { devDependencies: ... } }
 *
 * Every consumer that parses the lockfile as YAML must parse `main` only:
 * `yaml.parse` rejects multi-document input outright, and the environment
 * document's entries are not application dependencies.
 */
export interface PnpmLockfileDocuments {
  /**
   * The environment document's text, without its surrounding markers.
   * `undefined` when the lockfile has no environment document.
   */
  env?: string
  /** The application document's text: the whole file when `env` is absent. */
  main: string
}

const DOCUMENT_START = '---\n'
const DOCUMENT_SEPARATOR = '\n---\n'

/**
 * Splits a lockfile into its environment and application documents.
 *
 * Mirrors pnpm's own reader, which is textual rather than YAML-aware: a file
 * starting with `---\n` carries an environment document up to the first
 * `\n---\n`, and the application document is everything after it. A file
 * that starts with `---\n` but has no second marker is environment-only and
 * yields an empty `main`; pnpm treats such a file as having no environment
 * document to preserve, so `env` is left undefined there too. A file without
 * a leading marker is a plain single-document lockfile.
 *
 * A byte order mark and CRLF line endings are normalized first so the marker
 * detection is not defeated by editors that add either.
 */
export function splitPnpmLockfileDocuments (content: string): PnpmLockfileDocuments {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith(DOCUMENT_START)) {
    return { main: normalized }
  }
  const separator = normalized.indexOf(DOCUMENT_SEPARATOR, DOCUMENT_START.length)
  if (separator === -1) {
    return { main: '' }
  }
  return {
    env: normalized.slice(DOCUMENT_START.length, separator),
    main: normalized.slice(separator + DOCUMENT_SEPARATOR.length),
  }
}

/**
 * Reassembles what {@link splitPnpmLockfileDocuments} took apart, so that a
 * rewritten application document can be written back without dropping the
 * environment document pnpm expects to find in front of it.
 */
export function joinPnpmLockfileDocuments (documents: PnpmLockfileDocuments): string {
  if (documents.env === undefined) {
    return documents.main
  }
  return DOCUMENT_START + documents.env + DOCUMENT_SEPARATOR + documents.main
}
