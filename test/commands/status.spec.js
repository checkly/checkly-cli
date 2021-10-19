/* eslint-disable no-undef */
const { test, expect } = require('@oclif/test')
const testConfig = require('../helpers/config')

describe('status [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .nock('http://localhost:3000', (api) =>
      api.get('/v1/check-statuses').reply(200, [
        {
          status: 'Pending',
          name: 'API Check',
          'last ran': '-',
        },
      ])
    )
    .stdout()
    .command(['status', '--output', 'json'])
    .it('prints checks status', (ctx) =>
      expect(JSON.parse(ctx.stdout.replace('[log] ', '').trim())).to.eql([
        {
          status: 'Pending',
          name: 'API Check',
          'last ran': '-',
        },
      ])
    )
})
