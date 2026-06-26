export const CheckTypes = {
  API: 'API',
  BROWSER: 'BROWSER',
  HEARTBEAT: 'HEARTBEAT',
  MULTI_STEP: 'MULTI_STEP',
  PLAYWRIGHT: 'PLAYWRIGHT',
  TCP: 'TCP',
  ICMP: 'ICMP',
  DNS: 'DNS',
  URL: 'URL',
  GRPC: 'GRPC',
  SSL: 'SSL',
  TRACEROUTE: 'TRACEROUTE',
  AGENTIC: 'AGENTIC',
} as const

export type CheckType = typeof CheckTypes[keyof typeof CheckTypes]

export const allCheckTypes = Object.values(CheckTypes)

export const LOGICAL_ID_PATTERN = /^[A-Za-z0-9_\-/#.]+$/

// The construct type of the root Project.
//
// This is duplicated here (Project also exposes it as Project.__checklyType)
// so that the Session module can use the value without importing project.js.
// Every construct imports Session, and project.js imports every construct (it
// re-exports them through the constructs barrel), so if Session's module value-
// imported project.js the result would be a circular import that initialises a
// subclass before its base class ("Class extends value undefined"). Keeping the
// value here lets Session avoid that import.
export const PROJECT_CONSTRUCT_TYPE = 'project'
