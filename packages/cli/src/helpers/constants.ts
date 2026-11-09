export const DEFAULT_REGION = 'eu-central-1'

/**
 * Locations that no longer run checks. They are not part of `Region`, but a
 * JavaScript project, a cast or a command-line flag can still pass one.
 */
export const RETIRED_REGIONS = ['me-south-1'] as const

export type RetiredRegion = typeof RETIRED_REGIONS[number]

const RETIRED_REGION_NAMES: Record<RetiredRegion, string> = {
  'me-south-1': 'Bahrain',
}

export function isRetiredRegion (value: unknown): value is RetiredRegion {
  return RETIRED_REGIONS.some(region => region === value)
}

/**
 * The same text the backend returns when it rejects a retired location.
 */
export function retiredRegionMessage (region: RetiredRegion): string {
  return `Location "${region}" (${RETIRED_REGION_NAMES[region]}) is retired and can no longer run checks.`
    + ' Choose another location.'
}
