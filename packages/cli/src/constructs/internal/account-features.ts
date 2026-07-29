import { Session } from '../session.js'
import type { ResponseTimeLimits } from './common-diagnostics.js'

// Raises the response time limits the API accepts for TCP, API and URL checks.
const EXTENDED_RESPONSE_TIME_LIMITS = 'EXTENDED_RESPONSE_TIME_LIMITS'

/**
 * Response time limits for the authenticated account.
 *
 * Accounts with extended limits skip the client-side cap entirely: the exact
 * limit lives server-side and can change without a CLI release, so the CLI
 * defers to the API instead of hardcoding a ceiling. The degraded <= max
 * cross-check still applies.
 *
 * Falls back to the standard limit when the account is not entitled, and when
 * the API does not report features at all (older or self-hosted deployments).
 */
export function responseTimeLimits (standard: number): ResponseTimeLimits {
  const limit = Session.accountFeatures.includes(EXTENDED_RESPONSE_TIME_LIMITS)
    ? Number.MAX_SAFE_INTEGER
    : standard

  return {
    degradedResponseTime: limit,
    maxResponseTime: limit,
  }
}
