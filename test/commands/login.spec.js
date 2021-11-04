const testConfig = require('../helpers/config')
const config = require('./../../src/services/config')
const { test, expect } = require('@oclif/test')

describe('login [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .stdout()
    .command(['login', '--api-key', 'newKey', '--account-id', 'newId'])
    .exit(0)
    .it('sets apiKey and accountId', (ctx) => {
      expect(ctx.stdout).to.contain('Welcome to @checkly/cli')
      expect(config.auth.get('apiKey')).to.equal('newKey')
      expect(config.getAccountId()).to.equal('newId')
    })
})
