import { CheckGroup, BrowserCheck } from 'checkly/constructs'

const group = new CheckGroup('check-group-1', {
  name: 'Group',
  activated: true,
  muted: false,
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['mac', 'group'],
  environmentVariables: [],
  apiCheckDefaults: {},
  alertChannels: [],
  browserChecks: {
    // using .test.ts suffix (no .spec.ts) to avoid '@playwright/test not found error' when Jest transpile the spec.ts
    testMatch: '**/*.test.ts',
  },
})

new BrowserCheck('group-browser-check-1', {
  name: 'Check with group',
  activated: false,
  groupId: group.ref(),
  code: {
    content: 'throw new Error("Failing Check Result")',
  },
})
