const { test, expect } = require('@oclif/test')
const testConfig = require('../helpers/config')

describe('whoami [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .stdout()
    .command(['whoami', '--output', 'json'])
    .it('prints current account details', (ctx) =>
      expect(JSON.parse(ctx.stdout.replace('[log] ', '').trim())).to.eql({
        accountId: 'abc123',
        accountName: 'Test Account'
      })
    )
})
