const { HeartbeatCheck } = require('checkly/constructs')

new HeartbeatCheck('heartbeat-check-1', {
    name: 'Send weekly newsletter job',
    period: 30,
    periodUnit: 'minutes',
    grace: 10,
    graceUnit: 'minutes',
})
