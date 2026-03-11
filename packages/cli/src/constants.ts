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
} as const

export type CheckType = typeof CheckTypes[keyof typeof CheckTypes]

export const allCheckTypes = Object.values(CheckTypes)

export const LOGICAL_ID_PATTERN = /^[A-Za-z0-9_\-/#.]+$/
