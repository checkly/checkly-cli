/* eslint-disable no-undef */
const { test, expect } = require('@oclif/test')
const testConfig = require('../helpers/config')
const {
  mockChecksInfoResponse,
  mockChecksListResponse
} = require('../fixtures/api')

describe('checks [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .nock('https://api.checklyhq.com', (api) =>
      api.get('/v1/checks?limit=100&page=1').reply(200, mockChecksListResponse, {
        'content-range': `0-${mockChecksListResponse.length - 1}/${mockChecksListResponse.length}`
      })
    )
    .stdout()
    .command(['checks', '--output', 'json'])
    .it('prints checks list', (output) => {
      expect(JSON.parse(output.stdout.replace('[log] ', '').trim())).to.eql([
        {
          name: 'API Check',
          checkType: 'API',
          frequency: 10,
          locations: '',
          activated: true
        },
        {
          name: 'Runtime Ver',
          checkType: 'BROWSER',
          frequency: 10,
          locations: '',
          activated: false
        }
      ])
    })

  test
    .nock('https://api.checklyhq.com', (api) =>
      api
        .get('/v1/checks/' + mockChecksInfoResponse.id)
        .reply(200, mockChecksInfoResponse)
    )
    .stdout()
    .command([
      'checks',
      'info',
      mockChecksInfoResponse.id.toString(),
      '--output',
      'json'
    ])
    .it('prints check info details', (output) => {
      expect(JSON.parse(output.stdout.replace('[log] ', '').trim())).to.eql(
        mockChecksInfoResponse
      )
    })
})
