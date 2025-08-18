import { CheckGroupV2, Frequency } from 'checkly/constructs'

const group = new CheckGroupV2('check-group-1', {
  name: 'Synthetic Monitors Group',
  activated: true,
  muted: false,
  frequency: Frequency.EVERY_15M,
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['api-group'],
  concurrency: 10,
  browserChecks: {
    frequency: Frequency.EVERY_30M,
    testMatch: '**/__checks__/synthetics/*.spec.ts'
  }
})
