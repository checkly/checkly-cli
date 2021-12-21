const { test } = require('@oclif/test')
const testConfig = require('../helpers/config')

const account1 = {
  id: '01828488-11D6-439C-AAD2-E5E18A4F3267',
  name: 'Account 1'
}

const account2 = {
  id: '01C4401C-0B7B-4366-9782-2FB3EC31F9C1',
  name: 'Account 2'
}

describe('accounts [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .stdout()
    .nock('http://localhost:3000', (api) =>
      api.get('/next/accounts').reply(200, [account1, account2])
    )
    .command(['accounts', '--output', 'json'])
    .stdout()
    .it('list all user accounts', (ctx) => {})
})
