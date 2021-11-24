/* eslint-disable no-undef */
const { test, expect } = require('@oclif/test')
const testConfig = require('../helpers/config')
const config = require('./../../src/services/config')

const account1 = {
  id: '01828488-11D6-439C-AAD2-E5E18A4F3267',
  name: 'Account 1',
}

describe('switch [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .stdout()
    .command(['switch', '--account-id', '123'])
    .exit(1)
    .it('throw error when invalid account id', () => {})

  test
    .stdout()
    .command(['switch', '--account-id', account1.id])
    .exit(0)
    .it('switch account using --account-id flag', () => {
      expect(config.data.get('accountId')).to.equal(account1.id)
    })

  test
    .nock('http://localhost:3000', (api) =>
      api.get('/next/accounts').reply(200, [account1])
    )
    .stdout()
    .command(['switch'])
    .exit(0)
    .it('show solo account warning message', () => {})
})
