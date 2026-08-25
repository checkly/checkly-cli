import { LoadedNpmrcConfig, NPM_CONFIG_ENV_PREFIX } from './npmrc.js'
import { FETCHABLE_URL_REQUIREMENT, parseFetchableUrl } from './url.js'

/**
 * Joins up to 8 items, appending `<overflow>N more` for the rest — the
 * uniform truncation for user-facing lists of packages, versions and
 * reasons.
 */
export function capList (items: string[], separator: string, overflow: string): string {
  const shown = items.slice(0, 8).join(separator)
  return items.length > 8 ? `${shown}${overflow}${items.length - 8} more` : shown
}

/** Quotes and joins a list of names for a message. */
export function quotedList (names: string[]): string {
  return capList(names.map(name => `'${name}'`), ', ', ' and ')
}

/** Stand-in for a URL that cannot be shown without risking a credential. */
export const UNPRINTABLE_URL = '(withheld: unparseable and may contain credentials)'

/**
 * Rebuilds a URL from the parts that cannot carry a credential, so it can
 * safely appear in error messages and logs.
 *
 * Only scheme and host survive. Userinfo, path, query and fragment are
 * dropped by construction rather than stripped: a registry URL may embed a
 * token in its userinfo, a pre-signed CDN URL puts its signature in the
 * query, and some registries take a token as a PATH segment
 * (`https://host/<token>/npm/`). The path is the component least worth
 * keeping anyway — every message that shows a URL already names the
 * package and version separately, which is what the path encodes.
 *
 * A string that does not parse, parses without a host, or names a scheme
 * nothing here fetches over yields the placeholder instead — deliberately
 * the same rule as what may be requested, so a URL is echoable exactly when
 * it was fetchable. Earlier revisions tried to redact such strings with
 * a regex and leaked a credential four times over as many review rounds —
 * through the first `@` only, through an empty userinfo, through a
 * host-less parse, and through an authority that did not start at offset
 * zero. Nothing short of a parser can tell userinfo from a path in a
 * malformed string, so this follows the precedent already set for proxy
 * URLs in `rest/errors.ts` and declines to echo it at all. Callers name the
 * configuration key and file that produced the value instead, which is
 * where the reader would go to look anyway.
 */
export function redactUrl (url: string): string {
  // `origin` is deliberately not used to rebuild it: that is the string
  // "null" for non-special schemes.
  const parsed = parseFetchableUrl(url)
  return parsed === undefined ? UNPRINTABLE_URL : `${parsed.protocol}//${parsed.host}`
}

/**
 * Where the credentials sent with a request came from: a nerf-darted
 * config entry, or userinfo embedded in the URL itself.
 *
 * The `url` case carries a whole `UrlOrigin` rather than mirroring its
 * members, because the two must agree on every variant and a hand-kept
 * copy did not: a variant added to `UrlOrigin` alone once reported
 * registry-issued credentials as coming from a config line that contained
 * none. Reusing the type makes the compiler enforce what review had to.
 */
export type SentCredentials =
  | { from: 'config', keys: string[] }
  | { from: 'url', origin: UrlOrigin }

/**
 * Where a tarball URL came from: the lockfile recorded it verbatim, the
 * registry returned it in this package's metadata, or the CLI built it from
 * a registry. `registryKey` is absent when nothing configured one and the
 * public npm registry was assumed.
 *
 * Read both to attribute credentials the URL itself carries and to say
 * which setting produced a URL nothing can be fetched from — and the two
 * answers differ, so the variants are not interchangeable: a metadata URL
 * is the registry's to fix, not the project's.
 */
export type UrlOrigin =
  | RecordedUrlOrigin
  | { registryKey?: string }

/**
 * Names the registry a URL came from, by the key that configured it or as
 * the assumed default when nothing did.
 */
function describeRegistrySource (registryKey: string | undefined, npmrc: LoadedNpmrcConfig): string {
  return registryKey !== undefined
    ? `the registry configured by ${describeConfigKeys([registryKey], npmrc)}`
    : 'the default registry'
}

/**
 * A URL this CLI did not compose: something else handed it over already
 * formed, so it can be unusable however it likes.
 *
 * A URL the CLI builds itself cannot be. The registry it is built from is
 * checked first, and appending a path to a URL that parses with a host
 * leaves both intact — so those origins never reach a message about an
 * unusable URL, and are not in this type.
 */
export type RecordedUrlOrigin =
  | { lockfile: string }
  | { metadata: { registryKey?: string } }

/**
 * Says where an unusable URL came from, and therefore whose it is to fix.
 * The advice has to match the branch: telling someone to correct their
 * registry setting when the bad value came out of the lockfile sends them
 * to a setting that is already correct.
 */
export function describeUnusableUrlOrigin (origin: RecordedUrlOrigin, npmrc: LoadedNpmrcConfig): string {
  if ('lockfile' in origin) {
    return `It was recorded in '${origin.lockfile}', whose tarball URL for this package`
      + ` is not ${FETCHABLE_URL_REQUIREMENT}.`
  }
  const registry = describeRegistrySource(origin.metadata.registryKey, npmrc)
  const whose = origin.metadata.registryKey !== undefined
    ? `so check that the setting points at the registry you meant before taking it up with whoever runs it.`
    : `and nothing here configures a registry, so this came from the public one.`
  return `It came from the package metadata served by ${registry}, which returned a tarball URL`
    + ` that is not ${FETCHABLE_URL_REQUIREMENT}. The URL is the registry's to correct, ${whose}`
}

/** What a redirect did to the credentials on a request. */
export interface RedirectOutcome {
  /** The host the request was last redirected to. */
  host?: string
  /** True when credentials were sent but did not survive the hop. */
  credentialsDropped?: boolean
}

/**
 * Names config keys and where they came from, for a hint sentence. Keys are
 * listed individually because precedence is per key: the halves of a
 * `username`/`_password` pair can come from different sources.
 */
export function describeConfigKeys (keys: string[], npmrc: LoadedNpmrcConfig): string {
  const described = keys.map(key => {
    const origin = npmrc.origins.get(key)
    switch (origin?.kind) {
      // Name the variable verbatim: the stored key has the `npm_config_`
      // prefix stripped and may be case-folded, so echoing it would name
      // nothing the user can search their environment for.
      case 'env':
        return `the '${origin.variable}' environment variable`
      case 'file':
        return `'${key}' in '${origin.path}'`
      default:
        return `'${key}'`
    }
  })
  return capList(described, ', ', ' and ')
}

/**
 * The places a credential could have been configured, highest precedence
 * first. The environment channel is always consulted and outranks every
 * file, so a list that omits it sends people to edit files that cannot win.
 */
function describeConfigSources (npmrc: LoadedNpmrcConfig): string {
  return quotedList([
    `${NPM_CONFIG_ENV_PREFIX}* environment variables`,
    ...npmrc.files,
  ])
}

/**
 * Names where the credentials on a request came from, as a sentence tail
 * ending in a full stop.
 */
function describeSentCredentials (sent: SentCredentials, npmrc: LoadedNpmrcConfig): string {
  if (sent.from === 'config') {
    return `${describeConfigKeys(sent.keys, npmrc)}.`
  }
  const { origin } = sent
  if ('lockfile' in origin) {
    return `the tarball URL recorded in '${origin.lockfile}'.`
  }
  if ('metadata' in origin) {
    return `the tarball URL that ${describeRegistrySource(origin.metadata.registryKey, npmrc)} returned`
      + ` in this package's metadata, so they were issued by that registry rather than configured here.`
  }
  return `the URL of ${describeRegistrySource(origin.registryKey, npmrc)}.`
}

/**
 * Explains an HTTP failure that authentication could account for.
 *
 * 404 gets the same treatment as 401/403 because registries routinely hide
 * packages the caller is not authorized to see behind a 404 — npmjs does —
 * which otherwise reads as "this package does not exist" and sends people
 * looking in entirely the wrong place. The wording stays hedged for 404,
 * where a genuinely missing package is equally likely.
 *
 * Whenever credentials were sent, the message names where they came from.
 * They can come from any of several files or an environment variable, so
 * "your credentials were rejected" without saying which source supplied
 * them leaves the reader exactly as stuck as a bare 404.
 */
export function downloadFailureHint (
  status: number | undefined,
  sent: SentCredentials | undefined,
  npmrc: LoadedNpmrcConfig,
  redirect: RedirectOutcome = {},
): string {
  if (status !== 401 && status !== 403 && status !== 404) {
    // The URL in the message is the one that was requested; whatever the
    // status, say so when something else handled it. Without a status
    // nothing answered at all, so the hop is reported without claiming it
    // produced the failure.
    if (redirect.host === undefined) {
      return ''
    }
    return status === undefined
      ? ` The request was redirected to '${redirect.host}' before it failed.`
      : ` The request was redirected to '${redirect.host}', which is what answered.`
  }

  const sentences: string[] = []

  if (redirect.credentialsDropped === true) {
    // Never say the credentials were rejected: the host that answered never
    // saw them, and blaming them sends the reader to rotate a working
    // token. A redirect to an unauthenticated CDN is normal for GitHub
    // Packages and for Artifactory or Nexus fronted by object storage, so
    // this is often not the fault at all — hence the pointer to the
    // redirect target rather than a verdict about it.
    sentences.push(
      `The request was redirected to '${redirect.host}', and the credentials were dropped rather`
      + ` than forwarded there, so that host answered without them. This is normal when a registry`
      + ` redirects to a pre-signed URL; look at what that host returned.`,
    )
    if (sent !== undefined) {
      sentences.push(`The credentials the original host received came from ${describeSentCredentials(sent, npmrc)}`)
    }
  } else if (sent === undefined) {
    sentences.push(`No credentials for this registry were found in ${describeConfigSources(npmrc)}.`)
    if (status === 404) {
      sentences.push(
        `A registry may answer 404 for a package you are not authorized to see, so the package`
        + ` may exist but be invisible without credentials.`,
      )
    }
    if (redirect.host !== undefined) {
      // Without this the reader is told to configure credentials for a host
      // that never asked for any, when the status came from elsewhere.
      sentences.push(`Note that the request was redirected to '${redirect.host}', which is what answered.`)
    }
  } else {
    if (status === 404) {
      sentences.push(
        `Credentials were sent but did not grant access, so either the package does not exist`
        + ` or the credentials do not cover it.`,
      )
    } else {
      sentences.push(`The credentials sent for this registry were rejected — an expired token fails this way.`)
    }
    sentences.push(`They came from ${describeSentCredentials(sent, npmrc)}`)
    if (redirect.host !== undefined) {
      sentences.push(`They were carried through a redirect to '${redirect.host}', which is what answered.`)
    }
  }

  return ` ${sentences.join(' ')}${describeUnreadableConfig(npmrc)}`
}

/**
 * Names any config file that existed but could not be read, as a sentence
 * with a leading space or the empty string.
 *
 * Worth saying on any failure a credential could explain, not only the ones
 * that got as far as a status code: a skipped `auth.ini` is invisible
 * otherwise, and it is the likeliest thing to be missing when a private
 * package cannot be resolved at all.
 */
export function describeUnreadableConfig (npmrc: LoadedNpmrcConfig): string {
  if (npmrc.unreadable.length === 0) {
    return ''
  }
  return ` Note that ${quotedList(npmrc.unreadable)} could not be read, so any credentials it holds`
    + ` were not used.`
}
