const fs = require('fs')
const path = require('path')
const testConfig = require('../helpers/config')
const { test, expect } = require('@oclif/test')

describe('deploy [cmd]', () => {
  const cwd = process.cwd()

  before(() => {
    testConfig()
    if (!fs.existsSync(path.join(cwd, '.checkly'))) {
      // test
      //   .stdout()
      //   .command(['init', 'proj1'])
      //   .exit(0)
      //   .it('initializes .checkly dir', (ctx) => {
      //     console.log('0', ctx.stdout)
      //     // TODO: figure out how to answer inquirer prompts in test
      //     expect(ctx.stdout).to.contain('Checkly initialized')
      //   })

      // Create artificial `.checkly` dir for testing
      fs.mkdirSync(path.join(cwd, '.checkly', 'checks', 'test-group'), {
        recursive: true,
      })
      // Browser Check
      fs.copyFileSync(
        path.join(cwd, 'test', 'fixtures', 'yml', 'browser-check-valid.yml'),
        path.join(cwd, '.checkly', 'checks', 'browser-check.yml')
      )
      // API Check
      fs.copyFileSync(
        path.join(cwd, 'test', 'fixtures', 'yml', 'api-check-valid.yml'),
        path.join(cwd, '.checkly', 'checks', 'api-check.yml')
      )
      // Group Settings
      fs.copyFileSync(
        path.join(cwd, 'test', 'fixtures', 'yml', 'group-valid.yml'),
        path.join(cwd, '.checkly', 'checks', 'test-group', 'api-check.yml')
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
