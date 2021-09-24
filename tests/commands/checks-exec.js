/* eslint-disable no-undef */
const nock = require('nock')
const { mockChecksResponse } = require('../fixtures/api')
const { exec } = require('child_process')

describe('run checks cmd with console output', () => {
  it('shuold print checks reuslts', async (done) => {
    const scope = nock('http://localhost:3000')
      .get('/v1/checks')
      .reply(200, mockChecksResponse)

    // process.env = Object.assign(process.env, { NODE_ENV: 'development' })
    exec(
      './bin/run checks --output json',
      { env: { ...process.env, NODE_ENV: 'development' } },
      (err, stdout, stderr) => {
        if (err) console.error(err)

        expect(stdout).toEqual([
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

        scope.done()
        done()
      }
    )
  })
})
