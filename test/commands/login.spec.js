/* eslint-disable no-undef */
const os = require('os')
const inquirer = require('inquirer')
const { test, expect } = require('@oclif/test')
const { defaultConfig } = require('../fixtures/config')

describe('login', function () {
  test
    // .nock('http://localhost:3000', (api) => api.get('/v1/checks').reply(401))
    // .loadConfig(defaultConfig)
    .stub(inquirer, 'prompt', () => 'Do you want to replace key?')
    .stdout()
    .stdin(`n${os.EOL}`)
    .command(['login', '--apiKey', '123'])
    .it('login answer', (ctx) => {
      expect(inquirer.prompt).to.equal(true)
    })
})
