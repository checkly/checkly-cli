/* eslint-disable no-undef */
const nock = require('nock')
const stdout = require('test-console').stdout
const { mockProjectsResponse } = require('../fixtures/api')
const ProjectsCommand = require('../../src/commands/projects')

describe('Test Checks Command', () => {
  beforeEach(() => {
    process.env = Object.assign(process.env, { env: 'development' })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    nock.restore()
  })

  // afterAll(() => {
  //   nock.cleanAll()
  // })

  it('should print projects table', async () => {
    const scope = nock('http://localhost:3000')
      .get('/next/projects')
      .reply(200, mockProjectsResponse)

    const inspect = await stdout.inspectAsync(async () => {
      process.argv = ['list']
      await ProjectsCommand.run()
    })

    console.log(inspect)

    // Parsing raw stdout output from Buffer
    expect(
      JSON.parse(Buffer.from(inspect[1]).toString().replace('[log] ', ''))
    ).toEqual([
      {
        id: 7,
        name: 'test project 3',
        repoUrl: ' ',
        activated: false,
        muted: false,
        accountId: 'e46106d8-e382-4d1f-8182-9d63983ed6d4',
        created_at: '2021-07-28T17:36:07.718Z',
      },
      {
        id: 8,
        name: 'test project 32',
        repoUrl: ' ',
        activated: false,
        muted: false,
        accountId: 'e46106d8-e382-4d1f-8182-9d63983ed6d4',
        created_at: '2021-07-28T17:38:38.959Z',
      },
    ])
    scope.done()
  })
})
