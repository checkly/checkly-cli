/* eslint-disable no-undef */
const { test, expect } = require('@oclif/test')
const { defaultConfig } = require('../fixtures/config')

describe('whoami', () => {
  test
    .nock('http://localhost:3000', (api) =>
      api.get('/next/accounts').reply(200, {
        accountId: 'abc123mockaccountId',
        name: 'NockAccount',
      })
    )
    .stdout()
    .command(['whoami'])
    .it('prints current account details', (ctx) =>
      expect(ctx.stdout).to.contain(`
key   value
----  ------------------------------------
id    abc123mockaccountId
name  NockAccount`)
    )
})
