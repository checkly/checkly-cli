/**
 * Parses a URL that something is about to be fetched from, or returns
 * undefined when nothing can be.
 *
 * The scheme has to be one this CLI actually fetches over: `ftp://host/x`
 * parses and has a host, but axios cannot retrieve it, and tarball URLs
 * read out of lockfiles and registry metadata are already held to the same
 * http(s) rule. That also settles the shapes a bare parse lets through,
 * such as `admin:s3cret@nexus.local/x` — the opaque scheme `admin:` with an
 * empty host, and a credential sitting in what looks like a path. The host
 * is checked as well, belt and braces: the WHATWG parser refuses a
 * host-less `https://` today, and this rule means "a request can be made",
 * which needs somewhere to send it.
 *
 * This decides both whether a request can be made and whether the value is
 * safe to echo, which must be the same rule: a URL that reaches the network
 * is one `redactUrl` can rebuild from parts that cannot carry a secret.
 */
export function parseFetchableUrl (url: string): URL | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.host === '' || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return undefined
  }
  return parsed
}

/**
 * The rule `parseFetchableUrl` enforces, as a sentence for a message. Kept
 * beside the check so the two cannot drift into describing different rules.
 */
export const FETCHABLE_URL_REQUIREMENT = 'an absolute http or https URL with a host'

/**
 * Parses a URL that a path will be appended to, or returns undefined when
 * appending would not do what it looks like.
 *
 * Everything `parseFetchableUrl` requires, plus no query and no fragment:
 * those swallow whatever follows them. `https://host/npm/?token=abc` with
 * `bar/-/bar-2.0.0.tgz` appended parses with its pathname still `/npm/` and
 * the whole package path inside the query, so the request would go to the
 * registry root and fail later as something that reads like the registry's
 * fault. Excluding them is what makes "appending a path leaves the host and
 * the path intact" true rather than nearly true.
 */
export function parseComposableUrl (url: string): URL | undefined {
  // Tested on the raw string, not on `search` and `hash`: a URL ending in a
  // bare `?` or `#` parses with both of those empty, yet still absorbs
  // whatever is appended after the delimiter.
  if (/[?#]/.test(url)) {
    return undefined
  }
  return parseFetchableUrl(url)
}

/** The rule `parseComposableUrl` enforces, as a sentence for a message. */
export const COMPOSABLE_URL_REQUIREMENT = `${FETCHABLE_URL_REQUIREMENT}, carrying no query or fragment`
