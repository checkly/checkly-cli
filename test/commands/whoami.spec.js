/* eslint-disable no-undef */
const path = require('path')
const { test, expect } = require('@oclif/test')
const testConfig = require('../helpers/config')

describe('whoami [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .nock('http://localhost:3000', (api) =>
      api.get('/next/accounts/me').reply(200, {
        accountId: 'abc123mockaccountId',
        name: 'NockAccount',
      })
    )
    .stdout()
    .command(['whoami', '--output', 'json'])
    .it('prints current account details', (ctx) =>
      expect(JSON.parse(ctx.stdout.replace('[log] ', '').trim())).to.eql({
        accountId: 'abc123mockaccountId',
        name: 'NockAccount',
      })
    )
})
