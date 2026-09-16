import type { StatusPageV3ThemeColorGroup } from '../status-page-v3.js'

// Typed against the public group so a colour added to one cannot be missed
// in the other; the backend palette has the same twelve entries.
const properties: Record<keyof StatusPageV3ThemeColorGroup, true> = {
  bodyBackgroundColor: true,
  headerBackgroundColor: true,
  headerFontColor: true,
  titleFontColor: true,
  bodyFontColor: true,
  bodyFontColorMuted: true,
  navigationFontColor: true,
  linkFontColor: true,
  cardBackgroundColor: true,
  borderColor: true,
  primaryButtonBackgroundColor: true,
  primaryButtonFontColor: true,
}

export const statusPageV3ThemeColorProperties = Object.keys(properties) as (keyof StatusPageV3ThemeColorGroup)[]

export const statusPageV3Themes = ['light', 'dark'] as const

// Same format the backend accepts: #RGB or #RRGGBB, case-insensitive.
export const hexColorPattern = /^#([0-9A-F]{3}|[0-9A-F]{6})$/i
