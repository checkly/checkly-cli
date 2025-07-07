import { HeartbeatMonitor } from 'checkly/constructs'

// Heartbeat monitors allow you to monitor jobs or recurring tasks.
// This feature is only available on paid plans.
// Upgrade your plan to start using it https://app.checklyhq.com/new-billing
// If you're already on a paid plan, uncomment the following lines to create a heartbeat monitor.

/* new HeartbeatMonitor('heartbeat-1', {
    name: 'Send weekly newsletter job',
    period: 1,
    periodUnit: 'hours',
    grace: 30,
    graceUnit: 'minutes',
})
 */

