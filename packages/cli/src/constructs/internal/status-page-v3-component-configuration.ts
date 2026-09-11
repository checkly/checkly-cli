import type { StatusPageV3ComponentType } from '../status-page-v3-component.js'

/**
 * The backend's per-type configuration properties and their defaults
 * (`@checkly/shapes/status-pages-component` in the monorepo). The construct
 * derives its allowed keys from it and the import codegen elides values that
 * only restate a default, so a new property is one entry here plus the
 * interface on the construct.
 */
export const defaultConfigurationByType: Record<StatusPageV3ComponentType, Record<string, boolean>> = {
  SERVICE: { showHistoricalData: true },
  GROUP: { expandedByDefault: false, showHistoricalData: true },
}
