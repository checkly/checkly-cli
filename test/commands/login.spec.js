const testConfig = require('../helpers/config')
const ReadlineStub = require('../helpers/readline')
const config = require('./../../src/services/config')
const { test, expect } = require('@oclif/test')

describe('login [cmd]', () => {
  beforeEach(function () {
    this.rl = new ReadlineStub()
  })

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

  // Test real login process
  test
    .stdout()
    .command(['login'])
    .exit(0)
    .it('starts localhost:4242', (ctx) => {
      // Ensure server has started and is listening on port 4242
      console.log('rl', this.rl.output)
      console.log('rl1', this.rl.output.__raw__)
      console.log('ctx', ctx.stdout)
      expect(ctx.stdout).to.contain('Existing session')
    })
})
