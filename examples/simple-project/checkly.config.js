/* eslint-disable */
const path = require('path')
const { constructs } = require('@checkly/cli')

const { BrowserCheck } = constructs

const browser = new BrowserCheck('check-1', {
  name: 'simple-check-1',
  muted: false,
  activated: true,
  doubleCheck: false,
  shouldFail: false,
  runtimeId: '2022.10',
  locations: ['eu-central-1'],
  frequency: 10,
  tags: [],
  environmentVariables: [],
  alertChannels: [],
  code: BrowserCheck.bundle(path.join(__dirname, 'src', 'entrypoint.js')),
})
