const testConfig = require('../helpers/config')
const config = require('./../../src/services/config')
const { test, expect } = require('@oclif/test')

describe('run [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .stdout()
    .command(['run', 'test/fixtures/api-check-valid.yml'])
    .exit(0)
    .it('adhoc api check', (ctx) => {
      expect(ctx.stdout).to.contain('Success!')
    })

  test
    .stdout()
    .command(['run', 'test/fixtures/browser-check-valid.yml'])
    .exit(0)
    .it('adhoc browser check', (ctx) => {
      expect(ctx.stdout).to.contain('Success!')
    })
})
