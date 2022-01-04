/* eslint-disable no-undef */
const { test, expect } = require('@oclif/test')
const testConfig = require('../helpers/config')

describe('help [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .stdout()
    .command(['help'])
    .it('prints help and version number', (ctx) =>
      expect(ctx.stdout).to.contain(`
USAGE
  $ checkly [COMMAND]

COMMANDS
  accounts  Manage accounts
  add       Add a new checkly resource
  checks    Manage Checks
  deploy    Deploy and sync your ./checkly directory
  groups    Manage Groups
  help      display help for checkly
  init      Initialise a new Checkly Project
  login     Login with a Checkly API Key
  logout    Logout and clear local conf
  projects  Manage Projects
  run       Run and test your checks on Checkly
  status    Status dashboard
  switch    Switch user account
  whoami    See your logged account and user
`)
    )
})
