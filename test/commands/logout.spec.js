/* eslint-disable no-undef */
const { test, expect } = require('@oclif/test')
const testConfig = require('../helpers/config')
const config = require('../../src/services/config')

describe('logout [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .stdout()
    .command(['logout', '--force'])
    .exit(0)
    .it('clear config values', (ctx) => {
      expect(ctx.stdout.trim()).to.equal('[success] See you soon! 👋')
      expect(config.auth.get('apiKey')).to.equal(undefined)
      expect(config.data.get('accountId')).to.equal(undefined)
    })
})
