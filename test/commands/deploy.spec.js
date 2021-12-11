const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const path = require('path')
const testConfig = require('../helpers/config')
const { test, expect } = require('@oclif/test')
const fancy = require('fancy-test')

describe('deploy [cmd]', () => {
  const cwd = process.cwd()

  beforeEach(() => {
    testConfig()
    if (!fs.existsSync(path.join(cwd, '.checkly'))) {
      // Create artificial `.checkly` dir for testing
      fs.mkdirSync(path.join(cwd, '.checkly', 'checks', 'test-group'), {
        recursive: true,
      })
      // Browser Check
      fs.copyFileSync(
        path.join(cwd, 'test', 'fixtures', 'yml', 'browser-check-valid.yml'),
        path.join(cwd, '.checkly', 'checks', 'browser-check.yml')
      )
      // API Check
      fs.copyFileSync(
        path.join(cwd, 'test', 'fixtures', 'yml', 'api-check-valid.yml'),
        path.join(cwd, '.checkly', 'checks', 'api-check.yml')
      )
      // Group Settings
      fs.copyFileSync(
        path.join(cwd, 'test', 'fixtures', 'yml', 'group-valid.yml'),
        path.join(cwd, '.checkly', 'checks', 'test-group', 'api-check.yml')
      )
    }
  })

  after(() => {
    // Cleanup artificial `.checkly` dir
    if (fs.existsSync(path.join(cwd, '.checkly'))) {
      fs.rmdirSync(path.join(cwd, '.checkly'), { recursive: true })
    }
  })

  it('should successfully create json to backend', () => {
    test
      .nock('http://localhost:3000', (api) => {
        console.log('API!', api)
        return api
          .post('/next/projects/deploy')
          .reply(200, (uri, requestBody) => {
            console.log('req', this.req)
            console.log('uri', uri)
            console.log('rB', requestBody)
            return [
              {
                type: 'groups',
                typeResult: [
                  {
                    action: 'create',
                    results: [
                      {
                        logicalId: 'test-group',
                        physicalId: uuidv4(),
                        type: 'groups',
                      },
                    ],
                  },
                  {
                    action: 'update',
                    results: [],
                  },
                  {
                    action: 'delete',
                    results: [],
                  },
                ],
              },
              {
                type: 'checks',
                typeResult: [
                  {
                    action: 'create',
                    results: [
                      {
                        logicalId: 'browser-check.yml',
                        physicalId: uuidv4(),
                        type: 'checks',
                      },
                      {
                        logicalId: 'api-check.yml',
                        physicalId: uuidv4(),
                        type: 'checks',
                      },
                      {
                        logicalId: 'test-group/api-check.yml',
                        physicalId: uuidv4(),
                        type: 'checks',
                      },
                    ],
                  },
                  {
                    action: 'update',
                    results: [],
                  },
                  {
                    action: 'delete',
                    results: [],
                  },
                ],
              },
            ]
          })
      })
      .stdout()
      .command(['deploy', '--output', 'json'])
      .it('deploy check group and checks', (ctx) => {
        console.log(ctx.stdout)
        expect(ctx.stdout).to.contain(`
  {
    "create": [
      "test-group"
    ],
    "update": [],
    "delete": []
  }
              `)
        expect(ctx.stdout).to.contain(`
  {
    "create": [
      "test-group/api-check.yml",
      "api-check.yml"
      "browser-check.yml"
    ],
    "update": [],
    "delete": []
  }
              `)
        console.log(ctx.stdout)
      })
  })

  // Test deploy command
  // 1. Upload fixtures/group-valid.yml + fixtures/api-check-valid.yml + fixtures/browser-check-valid.yml
  // 2. CRUD
  //   2a. Create already taken care of with initial Upload
  //   2b. Read - checkly-cli checks --list
  //   2c. Update - add another fixture check
  //   2d. Update - change an existing fixture check
  //   2e. Delete - remove one existing fixture check
  // test
  //   .stdout()
  //   .command(['deploy'])
  //   .exit(0)
  //   .it('create check group and checks', (ctx) => {
  //     expect(ctx.stdout).to.contain('Welcome to @checkly/cli')
  //   })
})
