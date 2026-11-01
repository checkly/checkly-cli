import { ForbiddenError, UnauthorizedError } from '../rest/errors.js'
import type { ViewCounter, ViewFilters, ViewPage, ViewVisibility } from '../rest/views.js'

export const viewPageOptions = ['monitors', 'test-sessions'] as const
export const viewVisibilityOptions = ['private', 'account'] as const
export const viewCounterOptions = ['total', 'passing', 'degraded', 'failing'] as const
export const viewCounterClearOption = 'none'

type ViewPageOption = (typeof viewPageOptions)[number]

const viewPagesByOption = new Map<string, ViewPage>([
  ['monitors', 'monitors'],
  ['testsessions', 'testSessions'],
])

const viewPageOptionsByPage: Record<ViewPage, ViewPageOption> = {
  monitors: 'monitors',
  testSessions: 'test-sessions',
}

const USER_IDENTITY_REQUIRED = 'A user identity is required.'

/** Accepts the CLI value (`test-sessions`) as well as the API value (`testSessions`). */
export function normalizeViewPage (value: string | undefined): ViewPage | undefined {
  if (value === undefined) return undefined
  return viewPagesByOption.get(value.trim().toLowerCase().replace(/[-_]/g, ''))
}

export function toViewPageOption (page: ViewPage): ViewPageOption {
  return viewPageOptionsByPage[page]
}

export function normalizeViewVisibility (value: string | undefined): ViewVisibility | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toUpperCase()
  return normalized === 'PRIVATE' || normalized === 'ACCOUNT' ? normalized : undefined
}

export function normalizeViewCounter (value: string | undefined): ViewCounter | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  return viewCounterOptions.find(option => option === normalized)
}

/** Like `normalizeViewCounter`, but `none` clears the counter (`null`). */
export function normalizeViewCounterChange (value: string | undefined): ViewCounter | null | undefined {
  if (value?.trim().toLowerCase() === viewCounterClearOption) return null
  return normalizeViewCounter(value)
}

export function parseViewFilters (raw: string): ViewFilters {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON in --filters: ${raw}`)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`--filters must be a JSON object, e.g. '{"tags":["production"]}'.`)
  }

  return parsed as ViewFilters
}

// Service and legacy account keys can only come from the environment, and
// `checkly login` refuses to run while those variables are set.
const USER_KEY_REMEDY = 'Set CHECKLY_API_KEY to a user API key, '
  + 'or unset CHECKLY_API_KEY and CHECKLY_ACCOUNT_ID and run `npx checkly login`.'

export function describeViewError (err: unknown): string | undefined {
  // Authentication already passed by the time a views request is made, so a
  // 401 here is the views API refusing the kind of key, not a bad key.
  if (err instanceof UnauthorizedError) {
    return `Saved views need a user API key; legacy account API keys are not accepted. ${USER_KEY_REMEDY}`
  }
  if (err instanceof ForbiddenError && err.message === USER_IDENTITY_REQUIRED) {
    return 'Saved views belong to a user, so they need a user API key; service API keys are not accepted. '
      + USER_KEY_REMEDY
  }
  return undefined
}
