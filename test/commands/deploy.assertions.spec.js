const path = require('path')
const assert = require('assert')

const YAML = require('yaml')

const mock = require('mock-require')
const { fs: memfs, vol } = require('memfs')
const { checks } = require('../../src/services/api')
const getOrCreateProject = require('./project-helper')
const assertions = [
  {
    source: 'TEXT_BODY',
    target: 'en',
    property: 'lang="(.{2})"',
    comparison: 'EQUALS'
  },
  {
    source: 'STATUS_CODE',
    target: '200',
    property: '',
    comparison: 'EQUALS'
  }
]
const checkWithoutAssertions = {
  checkType: 'API',
  name: 'checklyhq-sample-assertion',
  request: {
    url: 'https://checklyhq.com',
    method: 'GET'
  },
  frequency: 10,
  activated: true,
  locations: ['us-east-1', 'us-east-2', 'us-west-1']
}

const checkWithAssertions = JSON.parse(JSON.stringify(checkWithoutAssertions))
checkWithAssertions.request.assertions = assertions

const settings = {
  projectName: 'checkly_cli_assertion_test_project',
  defaultCheckSettings: {
    locations: ['us-east-1', 'eu-central-1']
  }
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

describe('e2e test that assertions get persisted', () => {
  let runDeploy
  before(async () => {
    const dotenvFilePath = path.join(process.cwd(), `.env.${process.env.NODE_ENV}`)
    require('dotenv').config({ path: dotenvFilePath })
    mock('fs', memfs)
    mock('fs/promises', memfs.promises)
    // needed to create basic file structure
    updateInMemVolume(checkWithAssertions)
    // needs the mocked filesystem
    mock.reRequire('fs')
    const rd = mock.reRequire('../../src/modules/deploy')
    runDeploy = rd.runDeploy
    const p = await getOrCreateProject(
      'checkly_cli_assertion_test_project',
      'repoUrl'
    )
    settings.projectId = p.id
    // needed to projectId
    updateInMemVolume(checkWithAssertions)
  })
  after(() => {
    mock.stop('fs')
    mock.stop('fs/promises')
    delete process.env.CHECKLY_ACCOUNT_ID
    delete process.env.CHECKLY_API_KEY
  })
  const deployCheck = async (check) => {
    const deploymentResults = await runDeploy({ dryRun: false, force: true })
    assert.notStrictEqual(deploymentResults, {
      diff: { checks: { 'test.yml': 'UPDATE' } }
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
  }).timeout(5000)
})
