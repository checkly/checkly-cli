/* eslint-disable no-undef */
const nock = require('nock')
const stdout = require('test-console').stdout
const { mockChecksResponse } = require('../fixtures/api')
const ChecksCommand = require('../../src/commands/checks')

describe('Test Checks Command', () => {
  beforeAll(() => {
    //   if (!nock.isActive()) {
    //     nock.activate()
    //   }
    const scope = nock('http://localhost:3000')
      .get('/v1/checks')
      .reply(200, mockChecksResponse)
  })
  beforeEach(() => {
    process.env = Object.assign(process.env, { env: 'development' })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    // nock.cleanAll()
    scope.end()
  })

  it('should print checks table', async () => {
    const inspect = await stdout.inspectAsync(async () => {
      process.argv = ['list']
      await ChecksCommand.run()
    })

    console.log('ins', inspect)

    // console.log(JSON.parse(inspect).replace('[log] ', ''))
    console.log(Buffer.from(inspect).toString().replace('[log] ', ''))

    // Parsing raw stdout output from Buffer
    expect(
      JSON.parse(Buffer.from(inspect).toString().replace('[log] ', ''))
    ).toEqual([
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
  })
})
