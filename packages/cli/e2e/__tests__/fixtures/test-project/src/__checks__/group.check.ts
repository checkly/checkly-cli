import { CheckGroup, ApiCheck, BrowserCheck } from '@checkly/cli/constructs'
import { smsChannel, emailChannel } from '../alert-channels'
const alertChannels = [smsChannel, emailChannel]

const group = new CheckGroup('check-group-1', {
  name: 'Group',
  activated: true,
  muted: false,
  runtimeId: '2022.10',
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['mac', 'group'],
  environmentVariables: [],
  apiCheckDefaults: {},
  concurrency: 100,
  alertChannels,
  browserChecks: {
    testMatch: '**/*.spec.ts',
  },
})

const browserCheck = new BrowserCheck('group-browser-check-1', {
  name: 'Check with group',
  activated: false,
  groupId: group.ref(),
  code: {
    content: 'console.info(process.env.NODE_ENV);',
  },
})
