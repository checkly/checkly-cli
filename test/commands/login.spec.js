/* eslint-disable no-undef */
const os = require('os')
const { test, expect } = require('@oclif/test')

describe('login [cmd]', function () {
  test
    .nock('http://localhost:3000', (api) =>
      api.get('/next/accounts/me').reply(200, {
        accountId: 'abc123mockaccountId',
        name: 'NockAccount',
      })
    )
    .stdin(`y${os.EOL}`, 500) // answer inquirer prompt "y" with 500ms delay
    .stdout()
    .command(['login', '--apiKey', '123'])
    .it('keeps key')

  test
    .stdout()
    .stdin(`y${os.EOL}`, 500) // answer inquirer prompt "y" with 500ms delay
    .command(['login'])
    .it('generates auth0 URL', (ctx, done) => {
      expect(ctx.stdout).to.contain(
        'https://checkly.eu.auth0.com/authorize?client_id='
      )
      done()
    })
})
