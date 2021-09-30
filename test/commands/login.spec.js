/* eslint-disable no-undef */
const os = require('os')
const { test } = require('@oclif/test')

describe('login', function () {
  test
    .nock('http://localhost:3000', (api) =>
      api.get('/next/accounts').reply(200, {
        accountId: 'abc123mockaccountId',
        name: 'NockAccount',
      })
    )
    .stdin(`y${os.EOL}`, 500) // answer inquirer prompt "y" with 500ms delay
    .stdout({ print: true })
    .command(['login', '--apiKey', '123'])
    .it('login answer')
})
