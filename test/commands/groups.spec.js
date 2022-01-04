/* eslint-disable no-undef */
const { test, expect } = require('@oclif/test')
const testConfig = require('../helpers/config')
const { mockInfoResponse, mockListResponse } = require('../fixtures/groups')

describe('groups [cmd]', () => {
  before(() => {
    testConfig()
  })

  test
    .nock('https://api.checklyhq.com', (api) =>
      api.get('/v1/check-groups').reply(200, mockListResponse)
    )
    .stdout()
    .command(['groups', '--output', 'json'])
    .it('prints groups list', (output) => {
      expect(JSON.parse(output.stdout.replace('[log] ', '')).length).to.eql(
        mockListResponse.length
      )
    })

  test
    .nock('https://api.checklyhq.com', (api) =>
      api.get('/v1/check-groups/' + 1).reply(200, mockInfoResponse)
    )
    .stdout()
    .command([
      'groups',
      'info',
      mockInfoResponse.id.toString(),
      '--output',
      'json'
    ])
    .it('prints group info details', (output) => {
      expect(JSON.parse(output.stdout.replace('[log] ', '').trim())).to.eql(
        mockInfoResponse
      )
    })
})
