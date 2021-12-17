const path = require('path')
const assert = require('assert')
const dotenvFilePath = path.join(process.cwd(), `.env.${process.env.NODE_ENV}`)
require('dotenv').config({ path: dotenvFilePath })
const YAML = require('yaml')

const mock = require('mock-require')
const { fs: memfs, vol } = require('memfs')
const { checks } = require('../../src/services/api')

const assertions = [
  {
    source: 'TEXT_BODY',
    target: 'en',
    property: 'lang="(.{2})"',
    comparison: 'EQUALS',
  },
  {
    source: 'STATUS_CODE',
    target: '200',
    property: '',
    comparison: 'EQUALS',
  },
]
const checkWithoutAssertions = {
  checkType: 'API',
  name: 'checklyhq-sample-assertion',
  request: {
    url: 'https://checklyhq.com',
    method: 'GET',
  },
  frequency: 10,
  activated: true,
  locations: ['us-east-1', 'us-east-2', 'us-west-1'],
}

const checkWithAssertions = JSON.parse(JSON.stringify(checkWithoutAssertions))
checkWithAssertions.request.assertions = assertions

const settings = {
  projectId: 98,
  projectName: 'checkly_cli_assertion_test_project',
  locations: ['us-east-1', 'eu-central-1'],
  interval: '5min',
  alerts: [{ type: 'email', sendOn: ['recover', 'degrade', 'fail'] }],
}
const updateInMemVolume = (check) => {
  const CWD = process.cwd()
  const yamlpath = path.join(CWD, '.checkly/checks/test.yml')
  const settingspath = path.join(CWD, '.checkly/settings.yml')
  const inMemFs = {}
  inMemFs[yamlpath] = YAML.stringify(check)
  inMemFs[settingspath] = YAML.stringify(settings)
  vol.fromJSON(inMemFs)
}

updateInMemVolume(checkWithAssertions)
mock('fs', memfs)
mock('fs/promises', memfs.promises)

//needs the mocked filesystem
const { runDeploy } = require('../../src/services/deploy')

describe('test that assertions get persisted', () => {
  const deployCheck = async (check) => {
    const deploymentResults = await runDeploy(false)
    assert.notStrictEqual(deploymentResults, {
      diff: { checks: { 'test.yml': 'UPDATE' } },
    })

    const { data } = await checks.getAll()

    return data.find((x) => x.name === check.name)
  }

  it('persists and removes assertions', async () => {
    const deployedCheckAssertions = await deployCheck(checkWithAssertions)
    assert.notStrictEqual(
      deployedCheckAssertions.request.assertions,
      checkWithAssertions.request.assertions
    )

    updateInMemVolume(checkWithoutAssertions)

    const deployedCheckNoAssertions = await deployCheck(checkWithoutAssertions)
    assert.strictEqual(deployedCheckNoAssertions.request.assertions.length, 0)
  })
})
