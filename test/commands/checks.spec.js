/* eslint-disable no-undef */
import { expect, test } from '@oclif/test'
import { mockChecksResponse } from '../fixtures/api'

describe('checks - command', () => {
  test
    .nock('http://localhost:3000', (api) =>
      api
        .get('/v1/checks')
        // user is logged in, return their name
        .reply(200, mockChecksResponse)
    )
    .stdout()
    .command(['checks --output json'])
    .it('prints checks status', (ctx) => {
      expect(ctx.stdout).to.equal([
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

  // test
  //   .nock('https://api.heroku.com', (api) =>
  //     api
  //       .get('/account')
  //       // HTTP 401 means the user is not logged in with valid credentials
  //       .reply(401)
  //   )
  //   .command(['auth:whoami'])
  //   // checks to ensure the command exits with status 100
  //   .exit(100)
  //   .it('exits with status 100 when not logged in')
})
