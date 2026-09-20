import type { AgenticCheckOmittedProp } from '../agentic-check.js'

/**
 * The region an agentic check runs from when neither its props nor the
 * project config name any. Shared by the construct and its codegen without
 * widening the constructs' public surface.
 */
export const DEFAULT_AGENTIC_CHECK_LOCATION = 'us-east-1'

/**
 * The shared check props `buildCheckProps` would otherwise generate that an
 * agentic check's props omit (the construct forces them off whatever a
 * project default says). Typed against the props' own omission list, so a
 * prop that leaves or joins that list is caught here.
 */
export const AGENTIC_CHECK_OMITTED_PROPS = [
  'shouldFail',
  'privateLocations',
  'runParallel',
  'retryStrategy',
] as const satisfies readonly AgenticCheckOmittedProp[]
