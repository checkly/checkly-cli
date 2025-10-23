import { HeartbeatMonitor } from 'checkly/constructs'

// Heartbeat monitors allow you to monitor jobs or recurring tasks.
// After you deploy this check, you'll get a ping URL for your check
// from the Checkly CLI. This check will generate alerts if it's not
// getting pings at the generated URL, so it's deactivated for now.
// Further documentation: https://www.checklyhq.com/docs/heartbeat-monitors/

new HeartbeatMonitor('heartbeat-1', {
    name: 'Send weekly newsletter job',
    activated: false,
    period: 1,
    periodUnit: 'hours',
    grace: 30,
    graceUnit: 'minutes',
    })
