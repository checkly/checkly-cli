/* eslint-disable no-undef */
const os = require('os')
const testConfig = require('../helpers/config')
const config = require('./../../src/services/config')
const { test, expect } = require('@oclif/test')

describe.only('login [cmd]', function () {
  before(() => {
    testConfig()
  })

  test
    .stdout()
    .command(['whoami', '--output', 'json'])
    .it('prints current account details', (ctx) =>
      expect(JSON.parse(ctx.stdout.replace('[log] ', '').trim())).to.eql({
        accountId: 'abc123',
        accountName: 'Test Account',
      })
    )

  test
    .stdout()
    .command(['login', '--api-key', 'newKey', '--account-id', 'newId'])
    .it('sets apiKey and accountId', (ctx) => {
      expect(ctx.stdout).to.contain('Welcome to @checkly/cli')

      // expect(config.auth.get('apiKey')).should.equal('newKey')
      // expect(config.data.get('accountId')).should.equal('newId')
    })

  // test
  //   .stdout()
  //   .stdin(`y${os.EOL}`, 500) // answer inquirer prompt "y" with 500ms delay
  //   .stdin(`n${os.EOL}`, 500) // answer inquirer prompt "y" with 500ms delay
  //   .command(['login'])
  //   .it('generates auth0 URL', (ctx, done) => {
  //     expect(ctx.stdout).to.contain(
  //       'https://checkly.eu.auth0.com/authorize?client_id='
  //     )
  //     done()
  //   })
})
