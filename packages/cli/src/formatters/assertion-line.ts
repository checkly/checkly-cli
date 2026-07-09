import chalk from 'chalk'
import indentString from 'indent-string'

// Shared per-assertion line renderer.
//
// This is the single source of truth for how a check-result assertion is
// rendered as a human-readable line. Both the `checkly test` reporter
// (`reporters/util.ts`) and the `checkly checks get --result` detail renderer
// (`formatters/check-result-detail.ts`) call `formatAssertionLine` so their
// output is guaranteed identical and cannot drift.

// Humanized labels for the `source` of an assertion. Falls back to the raw
// source string when unmapped.
const assertionSources: Record<string, string> = {
  STATUS_CODE: 'status code',
  JSON_BODY: 'JSON body',
  HEADERS: 'headers',
  TEXT_BODY: 'text body',
  RESPONSE_TIME: 'response time',
  RESPONSE_DATA: 'response data',
  TEXT_ANSWER: 'answer (text)',
  JSON_ANSWER: 'answer (JSON)',
  RESPONSE_CODE: 'response code',
  LATENCY: 'latency',
  JSON_RESPONSE: 'response data (JSON)',
  GRPC_STATUS_CODE: 'status code',
  GRPC_HEALTHCHECK_STATUS: 'health check status',
  GRPC_RESPONSE: 'response message',
  GRPC_METADATA: 'metadata',
}

// Humanized phrases for the `comparison` of an assertion. Falls back to the raw
// comparison string when unmapped.
const assertionComparisons: Record<string, string> = {
  EQUALS: 'equals',
  NOT_EQUALS: 'doesn\'t equal',
  HAS_KEY: 'has key',
  NOT_HAS_KEY: 'doesn\'t have key',
  HAS_VALUE: 'has value',
  NOT_HAS_VALUE: 'doesn\'t have value',
  IS_EMPTY: 'is empty',
  NOT_EMPTY: 'is not empty',
  GREATER_THAN: 'is greater than',
  LESS_THAN: 'is less than',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'doesn\'t contain',
  IS_NULL: 'is null',
  NOT_NULL: 'is not null',
}

export type TruncateOptions = {
  chars?: number
  lines?: number
  ending?: string
}

function toString (val: any): string {
  if (typeof val === 'object') {
    return JSON.stringify(val, null, 2)
  } else {
    return val.toString()
  }
}

export function truncate (val: any, opts: TruncateOptions) {
  let truncated = false
  let result = toString(val)
  // Cap on the stringified length, not `val.length` — objects/numbers/booleans
  // have no meaningful `.length`, so the char cap was previously bypassed for
  // them. Slice by code point (spread) so we never split a UTF-16 surrogate
  // pair (emoji / astral chars) into an invalid half-character.
  if (opts.chars && result.length > opts.chars) {
    truncated = true
    result = [...result].slice(0, opts.chars).join('')
  }
  const lines = result.split('\n')
  if (opts.lines && lines.length > opts.lines) {
    truncated = true
    result = lines.slice(0, opts.lines).join('\n')
  }
  return {
    truncated,
    result: truncated && opts.ending ? result + opts.ending : result,
    lines: opts.lines ? Math.min(opts.lines, lines.length) : lines.length,
  }
}

// The common assertion shape shared by every check type's result body.
export type AssertionLike = {
  source?: string
  property?: string | null
  comparison?: string
  target?: unknown
  regex?: string | null
  error?: string | null
  actual?: unknown
}

export type FormatAssertionLineOptions = {
  truncate?: TruncateOptions
}

export const assertionSymbols = {
  success: '✔',
  error: '✖',
} as const

// Renders a single assertion as a colored, human-readable line (or multi-line
// block when the received value spans multiple lines). Green with a success
// symbol when the assertion passed (`error` absent/empty), red with an error
// symbol when it failed.
export function formatAssertionLine (
  assertion: AssertionLike,
  options?: FormatAssertionLineOptions,
): string {
  const { source, property, comparison, target, regex, error, actual } = assertion
  const assertionFailed = !!error
  const humanSource = assertionSources[source as string] || source
  const humanComparison = assertionComparisons[comparison as string] || comparison
  let actualString
  // Render the received value whenever one is present — including falsy values
  // like `0`, `false`, and `''`. Using a plain truthiness check here dropped the
  // "Received:" segment for exactly those, hiding the reason a boolean/numeric
  // assertion failed (e.g. CERT_NOT_EXPIRED received `false`, status code `0`).
  if (actual != null) {
    const { result: truncatedActual, lines: truncatedActualLines } = truncate(actual, {
      chars: 300,
      lines: 5,
      ending: chalk.magenta('\n...truncated...'),
      ...options?.truncate,
    })

    if (truncatedActualLines <= 1) {
      actualString = `Received: ${truncatedActual}.`
    } else {
      actualString = `Received:\n${indentString(truncatedActual, 4, { indent: ' ' })}`
    }
  }
  const message = [
    assertionFailed ? assertionSymbols.error : assertionSymbols.success,
    humanSource,
    property ? `property "${property}"` : undefined,
    regex ? `regex "${regex}"` : undefined,
    humanComparison,
    `target "${target}".`,
    actualString,
  ].filter(Boolean).join(' ')
  return assertionFailed ? chalk.red(message) : chalk.green(message)
}
