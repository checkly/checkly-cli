const CHECK_TYPES = {
  BROWSER: 'browser',
  API: 'api'
}

const CHECK_FREQUENCIES = {
  BROWSER: [
    '1min',
    '5min',
    '10min',
    '15min',
    '30min',
    '60min',
    '720min',
    '1440min'
  ],
  API: [
    '0min',
    '1min',
    '5min',
    '10min',
    '15min',
    '30min',
    '60min',
    '720min',
    '1440min'
  ]
}

const CHECK_STATUS = {
  FAILING: 'Failing',
  DEGRADED: 'Degraded',
  PASSING: 'Passing',
  PENDING: 'Pending'
}

const OUTPUTS = {
  JSON: 'json',
  HUMAN: 'human',
  PLAIN: 'plain'
}

const RESOURCES = {
  CHECK: 'check',
  GROUP: 'group',
  ALERT_CHANNEL: 'alert-channel'
}

const ACTIONS = {
  LIST: 'list',
  INFO: 'info',
  CREATE: 'create',
  DELETE: 'delete'
}

const CONFIGURATION_MODES = {
  BASIC: 'basic',
  ADVANCED: 'advanced'
}

module.exports = {
  ACTIONS,
  OUTPUTS,
  RESOURCES,
  CHECK_TYPES,
  CHECK_STATUS,
  CHECK_FREQUENCIES,
  CONFIGURATION_MODES
}
