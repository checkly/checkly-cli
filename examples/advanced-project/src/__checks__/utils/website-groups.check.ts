import { CheckGroupV2, Frequency } from 'checkly/constructs'

export const syntheticGroup = new CheckGroupV2('check-group-1', {
  name: 'Synthetic Monitors Group',
  activated: true,
  muted: false,
  frequency: Frequency.EVERY_15M,
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['synthetics'],
  concurrency: 10,
  browserChecks: {
    frequency: Frequency.EVERY_30M,
    testMatch: '../synthetics/*.spec.ts'
  }
})

export const uptimeGroup = new CheckGroupV2('check-group-2', {
  name: 'Uptime Monitors Group',
  muted: false,
  frequency: Frequency.EVERY_15M,
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['uptime'],
  concurrency: 10
})