import { LoadedNpmrcConfig, NPM_CONFIG_ENV_PREFIX } from './npmrc.js'

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
 * A string that does not parse, or parses without a host, yields the
 * placeholder instead. Earlier revisions tried to redact such strings with
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
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return UNPRINTABLE_URL
  }

  // `admin:s3cret@nexus.local/x` parses — as the opaque scheme `admin:`
  // with an EMPTY host — leaving the credential in the path, so a host is
  // required before anything is echoed. `origin` is not used to rebuild it
  // because it is the string "null" for non-special schemes.
  if (parsed.host === '') {
    return UNPRINTABLE_URL
  }

  return `${parsed.protocol}//${parsed.host}`
}

/**
 * Where the credentials sent with a request came from. `config` covers a
 * nerf-darted entry; `url` covers userinfo embedded in the registry URL,
 * which is configured elsewhere and so carries its own provenance.
 */
export type SentCredentials =
  | { from: 'config', keys: string[] }
  | { from: 'url', registryKey: string }
  | { from: 'url', lockfile: string }

/**
 * Where a tarball URL came from: the lockfile recorded it verbatim, or it
 * was built from a registry (`registryKey` absent when nothing configured
 * one and the public npm registry was assumed). Needed only to attribute
 * credentials the URL itself carries.
 */
export type UrlOrigin =
  | { lockfile: string }
  | { registryKey?: string }

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
  if ('registryKey' in sent) {
    return `the registry URL configured by ${describeConfigKeys([sent.registryKey], npmrc)}.`
  }
  return `the tarball URL recorded in '${sent.lockfile}'.`
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

  if (npmrc.unreadable.length > 0) {
    sentences.push(
      `Note that ${quotedList(npmrc.unreadable)} could not be read, so any credentials it holds`
      + ` were not used.`,
    )
  }

  return ` ${sentences.join(' ')}`
}
