/* eslint-disable */
const path = require('path')
const { constructs } = require('@checkly/cli')

const { CheckGroup } = constructs

const browser = new CheckGroup('group-1', {
  name: 'simple-check-1',
  muted: false,
  concurrency: 5,
  activated: true,
  runtimeId: '2022.10',
  locations: ['eu-central-1'],
  pattern: '**/*.checkly.js'
})
