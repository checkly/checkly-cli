/* eslint-disable no-undef */
const { test, expect } = require('@oclif/test')
const {
  mockChecksInfoResponse,
  mockChecksListResponse,
} = require('../fixtures/api')
const getConfig = require('../helpers/config')

getConfig()

describe('checks - command', () => {
  test
    .nock('http://localhost:3000', (api) =>
      api.get('/v1/checks').reply(200, mockChecksListResponse)
    )
    .stdout()
    .command(['checks', '--output', 'json'])
    .it('prints checks status', (output) => {
      expect(JSON.parse(output.stdout.trim())).to.eql([
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
    .stdout()
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
    .it('prints check info details', (output) => {
      expect(JSON.parse(output.stdout)).to.eql(mockChecksInfoResponse)
    })
})
