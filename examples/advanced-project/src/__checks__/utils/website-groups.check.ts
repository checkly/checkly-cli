import { CheckGroupV2, Frequency, AlertEscalationBuilder } from 'checkly/constructs'
import { smsChannel, emailChannel } from './alert-channels'

// This file defines two groups, one for synthetics monitors and one for uptime
// monitors. Read more about group configuration at: https://www.checklyhq.com/docs/groups/

export const syntheticGroup = new CheckGroupV2('check-group-synthetics', {
  name: 'Synthetic Monitors Group',
  activated: true,
  muted: false,
  frequency: Frequency.EVERY_15M,
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['synthetics'],
  // by setting an alertEscalationPolicy, these settings will override those on individual checks
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(
    2, // Alert after 2 consecutive failures
    { interval: 5, amount: 2 }, // Send 2 reminders, 5 minutes apart
    { enabled: true, percentage: 50 } // Alert if 50% of parallel runs fail
  ),
  alertChannels: [emailChannel, smsChannel],
  environmentVariables: [{ key: 'authorName', value: 'Fric Eromm' }],
  concurrency: 10
})

export const uptimeGroup = new CheckGroupV2('check-group-uptime', {
  name: 'Uptime Monitors Group',
  muted: false,
  frequency: Frequency.EVERY_15M,
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['uptime'],
  concurrency: 10
})
