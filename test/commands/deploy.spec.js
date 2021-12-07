const testConfig = require('../helpers/config')
const config = require('./../../src/services/config')
const { test, expect } = require('@oclif/test')

describe('deploy [cmd]', () => {
  before(() => {
    testConfig()
  })

  // Test deploy command
  // 1. Upload fixtures/group-valid.yml + fixtures/api-check-valid.yml + fixtures/browser-check-valid.yml
  // 2. CRUD
  //   2a. Create already taken care of with initial Upload
  //   2b. Read - checkly-cli checks --list
  //   2c. Update - add another fixture check
  //   2d. Update - change an existing fixture check
  //   2e. Delete - remove one existing fixture check
  test
    .stdout()
    .command(['deploy'])
    .exit(0)
    .it('create check group and checks', (ctx) => {
      expect(ctx.stdout).to.contain('Welcome to @checkly/cli')
    })
})
