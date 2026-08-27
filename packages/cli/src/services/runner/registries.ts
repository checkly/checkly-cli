import { parsePackageNamePattern } from '../embedded-packages/spec.js'
import { COMPOSABLE_URL_REQUIREMENT, parseComposableUrl } from '../embedded-packages/url.js'

/**
 * The file inside the code bundle that carries the `runner.registries`
 * configuration. This path is a contract with Checkly runners: when the
 * file is present, the runner routes package installs through a local
 * registry that selects upstreams according to the routing rules within.
 *
 * Pattern matching semantics are defined by the matcher in
 * `services/embedded-packages/spec.ts` (single `*` never crosses the `/`
 * scope separator, `**` does, and a `**` directly before a `/` may match
 * zero segments); runners must reproduce them exactly — off-the-shelf
 * glob matchers differ, e.g. on a `**` that is not a whole segment.
 *
 * When the file is present, its routing rules take precedence over
 * registry directives in the bundle's own config files (`.npmrc`,
 * `pnpm-workspace.yaml`, `.yarnrc.yml`) for upstream selection; those
 * files still supply connection settings such as TLS and proxy options.
 * Embedded packages (`.checkly/embedded-packages/`) always take priority
 * over any routing.
 *
 * Runner support must be deployed before a CLI release starts writing
 * this file: a runner that predates the feature ignores the file
 * entirely and installs from the bundle's own registry configuration,
 * with no error anywhere.
 */
export const REGISTRIES_ARCHIVE_PATH = '.checkly/registries.json'

/**
 * The format version written into {@link REGISTRIES_ARCHIVE_PATH}. Runners
 * reject versions they do not know, so the version only changes when the
 * file's meaning changes in a way an older runner must not silently
 * misread.
 */
export const REGISTRIES_FILE_VERSION = 1

/**
 * Credentials the runner presents to an upstream registry. The token must
 * be exactly one `${VAR}` environment variable reference: the value is
 * resolved from the check's environment variables on the runner, never on
 * the machine running the CLI, so the secret value appears in neither the
 * configuration nor the uploaded code bundle. Anything else — a literal
 * token, or a literal mixed with a reference — is rejected at config load.
 */
export type UpstreamAuth = {
  type: 'bearer'
  /**
   * A `${VAR}` reference to the environment variable holding the token,
   * e.g. `'${NPM_TOKEN}'` (in single quotes, so no shell or template
   * expansion happens locally).
   */
  token: string
}

/**
 * An npm registry the runner may install packages from.
 */
export interface Upstream {
  /**
   * The registry base URL, e.g. `'https://registry.npmjs.org/'`. Package
   * paths are appended to it, so the URL must not carry a query, fragment
   * or inline `user:password` credentials — use `auth` for credentials. A
   * missing trailing slash is added when the configuration is shipped,
   * since `https://host/npm` and `https://host/npm/` compose differently.
   */
  url: string
  auth?: UpstreamAuth
}

/**
 * Routes packages matching `pattern` to one or more upstreams. The runner
 * tries the listed upstreams in order and uses the first one that serves
 * the package; a 404 or an unreachable upstream moves on to the next.
 *
 * Fallthrough is deliberately confined to the rule's own upstream list:
 * when every listed upstream misses, the install fails rather than
 * falling through to a later, broader rule. Falling back to a broader
 * rule would silently send private package names to whatever upstream
 * that rule names — the dependency-confusion attack in one move. To allow
 * a fallback registry for a scope, list it in the scope's own rule.
 */
/**
 * Equivalent of TypeScript 5.4's `NoInfer` intrinsic, spelled as a
 * deferred conditional so the published declarations do not force
 * consumer projects onto TypeScript 5.4+.
 */
type NoInferCompat<T> = [T][T extends unknown ? 0 : never]

export interface PackageRoutingRule<UpstreamName extends string = string> {
  /**
   * A package name pattern with the same wildcard syntax as
   * `bundle.packages.embed`: a single `*` never crosses the `/` scope
   * separator, a `**` does, and a `**` directly before a `/` may together
   * with it match nothing, so `'**' + '/utils'` matches both `utils` and
   * `@acme/utils`. Exclusion (`!`) patterns are not supported here — each
   * rule stands alone, so there is nothing for an exclusion to subtract
   * from.
   */
  pattern: string
  /**
   * Names of upstreams to try in order; each must be a key of
   * {@link Registries.upstreams}.
   */
  upstreams: NoInferCompat<UpstreamName>[]
}

/**
 * Registry routing configuration for Checkly runners
 * (`runner.registries` in `checkly.config.ts`). Rules apply first-match-
 * wins, top-down: specific rules first, and the last rule must be the
 * `'**'` match-all fallback — a rule placed after it could never match.
 */
export interface Registries<UpstreamName extends string = string> {
  upstreams: Record<UpstreamName, Upstream>
  packages: PackageRoutingRule<UpstreamName>[]
}

/**
 * The literal pattern the final routing rule must have so that all
 * packages have a route. Only this exact spelling is recognized: an
 * equivalent wildcard pattern (`'***'`, or a broad pattern that happens
 * to match everything) neither satisfies the requirement nor triggers
 * the dead-rule check for rules placed after it.
 */
export const MATCH_ALL_PATTERN = '**'

/**
 * Exactly one environment variable reference and nothing else. Anchored
 * on both ends so a literal secret cannot ride along with a reference
 * (`'secret${VAR}'`), and restricted to plausible variable names so an
 * unresolvable reference like `'${ }'` fails here rather than as an
 * authentication error on the runner.
 */
const ENV_VAR_REFERENCE_RE = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/

/**
 * Upstream names are plain labels: leading alphanumeric, then
 * alphanumerics, `-` and `_`. Anything fancier serves no purpose and
 * invites trouble — an own `__proto__` key, for one, cannot round-trip
 * through a plain object rebuild.
 */
const UPSTREAM_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A key the schema does not define is more likely a typo (`authh`) than
 * an intention, and ignoring it silently disables whatever the user meant
 * to configure, surfacing only as an install failure on the runner.
 */
function rejectUnknownKeys (context: string, value: Record<string, unknown>, known: string[]): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) {
      throw new Error(`${context}: unknown field '${key}' (expected only: ${known.map(k => `'${k}'`).join(', ')})`)
    }
  }
}

/**
 * Validates the value of `runner.registries` and returns it typed. All
 * failures throw a plain `Error` whose message names the offending part
 * relative to `runner.registries`; the config loader wraps it with the
 * full config path. Invalid URLs and tokens are deliberately never echoed
 * back — a malformed registry URL may carry an inline credential.
 *
 * Plain-JS configs bypass the TypeScript type, so the shape must be
 * enforced at runtime, exactly as `validateBundle` does for
 * `bundle.packages`.
 */
export function validateRegistries (value: unknown): Registries {
  if (!isPlainObject(value)) {
    throw new Error(`must be an object`)
  }

  rejectUnknownKeys(`'runner.registries'`, value, ['upstreams', 'packages'])

  const { upstreams, packages } = value

  if (!isPlainObject(upstreams)) {
    throw new Error(`'upstreams' must be an object mapping upstream names to { url, auth? }`)
  }

  const upstreamNames = Object.keys(upstreams)
  if (upstreamNames.length === 0) {
    throw new Error(`'upstreams' must define at least one upstream`)
  }

  for (const name of upstreamNames) {
    validateUpstream(name, upstreams[name])
  }

  if (!Array.isArray(packages)) {
    throw new Error(`'packages' must be an array of { pattern, upstreams } routing rules`)
  }

  let lastPattern: string | undefined
  for (const [index, rule] of packages.entries()) {
    const { pattern } = validatePackageRoutingRule(index, rule, upstreamNames)

    // First match wins, so nothing past a match-all rule could ever
    // apply. Requiring the match-all to be the final rule both guarantees
    // every package a route and keeps silently dead rules out of the
    // config. The final-rule check below also rejects an empty rule list.
    if (pattern === MATCH_ALL_PATTERN && index !== packages.length - 1) {
      throw new Error(
        `packages[${index}]: rules after a '${MATCH_ALL_PATTERN}' match-all rule can never apply `
        + `(the first matching rule wins); move the match-all rule last`,
      )
    }

    lastPattern = pattern
  }

  if (lastPattern !== MATCH_ALL_PATTERN) {
    throw new Error(
      `'packages' must end with a match-all rule ({ pattern: '${MATCH_ALL_PATTERN}', ... }) `
      + `so that every package has a route`,
    )
  }

  return value as unknown as Registries
}

function validateUpstream (name: string, value: unknown): void {
  if (!UPSTREAM_NAME_RE.test(name)) {
    throw new Error(
      `upstream name '${name}' is invalid: names must start with a letter or digit `
      + `and contain only letters, digits, '-' and '_'`,
    )
  }

  if (!isPlainObject(value)) {
    throw new Error(`upstream '${name}' must be an object with a 'url'`)
  }

  rejectUnknownKeys(`upstream '${name}'`, value, ['url', 'auth'])

  const { url, auth } = value

  const parsedUrl = typeof url === 'string' ? parseComposableUrl(url) : undefined
  if (parsedUrl === undefined) {
    throw new Error(`upstream '${name}': 'url' must be ${COMPOSABLE_URL_REQUIREMENT}`)
  }

  // An inline credential would ship in plaintext inside the uploaded code
  // bundle — the exact outcome the ${VAR}-only rule on auth tokens exists
  // to prevent. The URL is not echoed for the same reason.
  if (parsedUrl.username !== '' || parsedUrl.password !== '') {
    throw new Error(
      `upstream '${name}': 'url' must not contain credentials; `
      + `use auth: { type: 'bearer', token: '\${VAR}' } instead`,
    )
  }

  if (auth === undefined) {
    return
  }

  if (!isPlainObject(auth)) {
    throw new Error(`upstream '${name}': 'auth' must be an object if set`)
  }

  rejectUnknownKeys(`upstream '${name}': 'auth'`, auth, ['type', 'token'])

  if (auth.type !== 'bearer') {
    throw new Error(`upstream '${name}': 'auth.type' must be 'bearer'`)
  }

  if (typeof auth.token !== 'string' || !ENV_VAR_REFERENCE_RE.test(auth.token)) {
    throw new Error(
      `upstream '${name}': 'auth.token' must be exactly one environment variable reference in \${VAR} syntax `
      + `(e.g. '\${NPM_TOKEN}'). The variable is resolved from the check's environment variables on the `
      + `Checkly runner; any literal content would bake a secret into the code bundle`,
    )
  }
}

function validatePackageRoutingRule (index: number, value: unknown, upstreamNames: string[]): PackageRoutingRule {
  if (!isPlainObject(value)) {
    throw new Error(`packages[${index}] must be an object with 'pattern' and 'upstreams'`)
  }

  rejectUnknownKeys(`packages[${index}]`, value, ['pattern', 'upstreams'])

  const { pattern, upstreams } = value

  if (typeof pattern !== 'string') {
    throw new Error(`packages[${index}]: 'pattern' must be a string`)
  }

  let parsed
  try {
    parsed = parsePackageNamePattern(pattern)
  } catch (cause) {
    throw new Error(`packages[${index}]: ${(cause as Error).message}`, { cause })
  }

  if (parsed.exclude) {
    throw new Error(
      `packages[${index}]: exclusion patterns ('!') are not supported in routing rules; `
      + `each rule stands alone, so there is nothing for an exclusion to subtract from`,
    )
  }

  if (!Array.isArray(upstreams) || upstreams.length === 0) {
    throw new Error(`packages[${index}]: 'upstreams' must be a non-empty array of upstream names`)
  }

  for (const name of upstreams) {
    if (typeof name !== 'string' || !upstreamNames.includes(name)) {
      throw new Error(
        `packages[${index}]: upstream '${String(name)}' is not defined under 'upstreams' `
        + `(defined: ${upstreamNames.map(known => `'${known}'`).join(', ')})`,
      )
    }
  }

  return value as unknown as PackageRoutingRule
}

/**
 * Serializes a validated configuration into the canonical contents of
 * {@link REGISTRIES_ARCHIVE_PATH}. Only known fields are written, and
 * upstream names are sorted so the output (and with it the dependency
 * cache hash) does not change when the config file merely reorders
 * entries. Rule order is semantic (first match wins) and is preserved
 * as-is. Upstream URLs are written in WHATWG-normalized form with a
 * trailing slash guaranteed, so runners can compose package paths onto
 * them by concatenation. Auth tokens are written unexpanded: the `${VAR}`
 * reference is resolved on the runner.
 */
export function serializeRegistries (registries: Registries): string {
  const upstreams: Record<string, Upstream> = {}
  for (const name of Object.keys(registries.upstreams).sort()) {
    const { url, auth } = registries.upstreams[name]
    const upstream: Upstream = { url: normalizeUpstreamUrl(url) }
    if (auth !== undefined) {
      upstream.auth = { type: auth.type, token: auth.token }
    }
    upstreams[name] = upstream
  }

  const packages = registries.packages.map(({ pattern, upstreams }) => ({
    pattern,
    upstreams: [...upstreams],
  }))

  return JSON.stringify({
    version: REGISTRIES_FILE_VERSION,
    upstreams,
    packages,
  }, null, 2) + '\n'
}

function normalizeUpstreamUrl (url: string): string {
  const parsed = parseComposableUrl(url)
  if (parsed === undefined) {
    // Serialization only runs on validated configurations.
    throw new Error(`upstream URL must be ${COMPOSABLE_URL_REQUIREMENT}`)
  }
  return parsed.href.endsWith('/') ? parsed.href : `${parsed.href}/`
}
