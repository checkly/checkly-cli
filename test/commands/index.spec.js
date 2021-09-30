/* eslint-disable no-undef */
const { test, expect } = require('@oclif/test')
const { defaultConfig } = require('../fixtures/config')

describe('version', () => {
  test
    .stdout()
    .command(['help'])
    .it('prints version number', (ctx) =>
      expect(ctx.stdout).to.contain(`
USAGE
  $ checkly [COMMAND]

COMMANDS
  add       Add a new group or check file
  checks    Manage Checks
  conf      manage configuration
  deploy    Deploy and sync your ./checkly directory
  groups    Manage Groups
  help      display help for checkly
  init      Initialise a new Checkly Project
  login     Login with a Checkly API Key [WIP]
  logout    Logout and clear local conf
  projects  Manage Checks
  run       Run and test your checks on Checkly
  status    Status dashboard`)
    )
})
