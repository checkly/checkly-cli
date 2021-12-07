const fs = require('fs/promises')
const testConfig = require('../helpers/config')
const { test, expect } = require('@oclif/test')

describe('deploy [cmd]', () => {
  before(() => {
    testConfig()
    if (!fs.existsSync('../../.checkly')) {
      test
        .stdout()
        .command(['init', 'proj1'])
        .exit(0)
        .it('initializes .checkly dir', (ctx) => {
          // TODO: figure out how to answer inquirer prompts in test
          expect(ctx.stdout).to.contain('Checkly initialized')
        })

      // Create artificial `.checkly` dir for testing

      // Browser Check
      fs.copyFile(
        '../fixtures/yml/browser-check-valid.yml',
        '../../.checkly/checks/browser-check.yml'
      )
      // API Check
      fs.copyFile(
        '../fixtures/yml/api-check-valid.yml',
        '../../.checkly/checks/api-check.yml'
      )
      // Root Settings
      fs.copyFile(
        '../fixtures/yml/project-valid.yml',
        '../../.checkly/settings.yml'
      )
      // Group Directory
      fs.mkdirSync('../../.checkly/checks/test-group')
      // Group Settings
      fs.copyFile(
        '../fixtures/yml/group-valid.yml',
        '../../.checkly/checks/test-group/settings.yml'
      )
    }
  })

  after(() => {
    // Cleanup artificial `.checkly` dir
    if (fs.existsSync('../../.checkly')) {
      fs.rmdirSync('../../.checkly', { recursive: true })
    }
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
