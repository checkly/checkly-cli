/* eslint-disable no-undef */
const { expect, test } = require('@oclif/test')
const {
  mockChecksInfoResponse,
  mockChecksListResponse,
} = require('../fixtures/api')
const { defaultConfig } = require('../fixtures/config')
// const getConfig = require('../helpers/config')

// getConfig()

describe('checks - command', () => {
  test
    .nock('http://localhost:3000', (api) =>
      api.get('/v1/checks').reply(200, mockChecksListResponse)
    )
    .loadConfig(defaultConfig)
    .stdout()
    .command(['checks', '--output', 'json'])
    .it('prints checks status', (ctx) => {
      expect(JSON.parse(ctx.stdout.trim())).to.eql([
        {
          name: 'API Check',
          checkType: 'API',
          frequency: 10,
          locations: [],
          activated: true,
        },
        {
          name: 'Runtime Ver',
          checkType: 'BROWSER',
          frequency: 10,
          locations: [],
          activated: false,
        },
      ])
    })

  test
    .nock('http://localhost:3000', (api) =>
      api
        .get('/v1/checks/92b98ec6-15bd-4729-945a-de1125659271')
        .reply(200, mockChecksListResponse[0])
    )
    .stdout()
    .command([
      'checks',
      'info',
      '--output',
      'json',
      '92b98ec6-15bd-4729-945a-de1125659271',
    ])
    .it('prints check info details', (ctx) => {
      expect(JSON.parse(ctx.stdout)).to.eql(mockChecksInfoResponse)
    })
})
