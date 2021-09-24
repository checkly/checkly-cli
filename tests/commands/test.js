/* eslint-disable no-undef */
// const Config = require('@oclif/config')
const nock = require('nock')
const getConfig = require('../helper/config')
const { mockChecksResponse } = require('../fixtures/api')
const ChecksCommand = require('../../src/commands/checks')
const test = require('@oclif/test')

describe('checks command', () => {
  let stdout
  let stderr
  let config
  let scope

  beforeAll(() => {
    scope = nock('http://localhost:3000')
      .get('/v1/checks')
      .reply(200, mockChecksResponse)
  })

  afterAll(() => {
    scope.end()
  })

  beforeEach(async () => {
    stdout = []
    stderr = []
    await getConfig()
    // jest
    //   .spyOn(process.stdout, 'write')
    //   .mockImplementation((val) => stdout.push(val))
    // jest
    //   .spyOn(process.stderr, 'write')
    //   .mockImplementation((val) => stderr.push(val))
  })

  describe('checks list', () => {
    it('should print json response', async () => {
      test.stdout().end('logs', (output) => {
        console.log('foo')
        // expect(output.stdout).to.equal('foo\n')
        expect(output.stdout).toContain([
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
      // await ChecksCommand.run(['list', '--output json'], config)
      // console.log('reszi', stdout)
      // expect(process.stdout.write).toContain([
      //   {
      //     name: 'API Check',
      //     checkType: 'API',
      //     frequency: 10,
      //     locations: [],
      //     activated: true,
      //   },
      //   {
      //     name: 'Runtime Ver',
      //     checkType: 'BROWSER',
      //     frequency: 10,
      //     locations: [],
      //     activated: false,
      //   },
      // ])
    })
  })
})
