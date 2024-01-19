import axios from 'axios'
import * as rimraf from 'rimraf'
import * as path from 'path'
import * as fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { runChecklyCreateCli } from '../run-create-cli'
import { getUserGreeting } from '../../src/utils/messages'
import { PROJECT_TEMPLATES } from '../../src/utils/prompts'
import { SpawnSyncReturns } from 'child_process'

const E2E_PROJECT_PREFIX = 'e2e-test-project-'

function cleanupProjects () {
  rimraf.sync(`${path.join(__dirname, 'fixtures', 'empty-project', E2E_PROJECT_PREFIX)}*`, { glob: true })
  rimraf.windowsSync(`${path.join(__dirname, 'fixtures', 'empty-project', E2E_PROJECT_PREFIX)}*`, { glob: true })
  rimraf.sync(path.join(__dirname, 'fixtures', 'playwright-project', '__checks__'), { glob: true })
  rimraf.sync(path.join(__dirname, 'fixtures', 'playwright-project', 'checkly.config.ts'), { glob: true })
}

function expectVersionAndName ({
  commandOutput,
  version,
  latestVersion,
  greeting,
}: {
  commandOutput: SpawnSyncReturns<string>
  version?: string
  latestVersion: string
  greeting: string
}) {
  if (!version) {
    expect(commandOutput.stdout).toContain(`Notice: replacing version '0.0.1-dev' with latest '${latestVersion}'.`)
  }
  expect(commandOutput.stdout).toContain(`v${version ?? latestVersion} Build and Run Synthetics That Scale`)
  expect(commandOutput.stdout).toContain(`${greeting} Let's get you started on your monitoring as code journey!`)
}

function expectCompleteCreation ({
  commandOutput,
  projectFolder,
}: {
  commandOutput: SpawnSyncReturns<string>
  projectFolder: string
}) {
  expect(commandOutput.stdout).toContain(`All done. Time to get testing & monitoring with Checkly

         > Enter your project directory using cd ${projectFolder}
         > Run npx checkly login to login to your Checkly account
         > Run npx checkly test to dry run your checks
         > Run npx checkly deploy to deploy your checks to the Checkly cloud

         Questions?

         - Check the docs at https://checklyhq.com/docs/cli
         - Join the Checkly Slack community at https://checklyhq.com/slack`)
}

describe('bootstrap', () => {
  let latestVersion = ''
  let projectName = ''
  let greeting = ''
  beforeAll(async () => {
    const packageInformation = await axios.get('https://registry.npmjs.org/checkly/latest')
    latestVersion = packageInformation.data.version
    greeting = await getUserGreeting()
  })
  beforeEach(() => {
    projectName = `${E2E_PROJECT_PREFIX}${uuidv4()}`
  })
  afterAll(() => cleanupProjects())

  it('Should create project with advanced-project template', () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const projectFolder = path.join(directory, projectName)
    const commandOutput = runChecklyCreateCli({
      directory,
      promptsInjection: [projectName, 'advanced-project', true, true],
    })

    const { status, stdout, stderr } = commandOutput

    expectVersionAndName({ commandOutput, latestVersion, greeting })

    expect(stdout).toContain('Downloading example template...')
    expect(stdout).toContain('Example template copied!')
    expect(stdout).toContain('Installing packages')
    expect(stdout).toContain('Packages installed successfully')

    expect(stderr).toBe('')
    expect(status).toBe(0)

    expect(fs.existsSync(path.join(projectFolder, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, 'checkly.config.ts'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, 'node_modules'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, '.git'))).toBe(true)
  }, 30000)

  it('Should create an boilerplate-project without installing dependencies', () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const projectFolder = path.join(directory, projectName)
    const commandOutput = runChecklyCreateCli({
      directory,
      promptsInjection: [projectName, 'boilerplate-project', false, false],
    })

    expectVersionAndName({ commandOutput, latestVersion, greeting })

    const { status, stdout, stderr } = commandOutput

    expect(stdout).toContain('Downloading example template...')
    expect(stdout).toContain('Example template copied!')
    expect(stdout).not.toContain('Installing packages')
    expect(stdout).not.toContain('Packages installed successfully')

    // no git initialization message
    expect(stdout).toContain('No worries. Just remember to install the dependencies after this setup')

    expectCompleteCreation({ commandOutput, projectFolder })

    expect(stderr).toBe('')
    expect(status).toBe(0)

    expect(fs.existsSync(path.join(projectFolder, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, 'checkly.config.ts'))).toBe(true)

    // node_modules nor .git shouldn't exist
    expect(fs.existsSync(path.join(projectFolder, 'node_modules'))).toBe(false)
    expect(fs.existsSync(path.join(projectFolder, '.git'))).toBe(false)
  }, 15000)

  it('Should create an boilerplate-project using an older version', () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const projectFolder = path.join(directory, projectName)
    const version = '4.0.13'
    const commandOutput = runChecklyCreateCli({
      directory,
      version,
      promptsInjection: [projectName, 'boilerplate-project', false, false],
    })

    expectVersionAndName({ commandOutput, version, latestVersion, greeting })

    const { status, stdout, stderr } = commandOutput

    expect(stdout).toContain('Downloading example template...')
    expect(stdout).toContain('Example template copied!')
    expect(stdout).not.toContain('Installing packages')
    expect(stdout).not.toContain('Packages installed successfully')

    // no git initialization message
    expect(stdout).toContain('No worries. Just remember to install the dependencies after this setup')

    expectCompleteCreation({ commandOutput, projectFolder })

    expect(stderr).toBe('')
    expect(status).toBe(0)

    expect(fs.existsSync(path.join(projectFolder, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, 'checkly.config.ts'))).toBe(true)

    // node_modules nor .git shouldn't exist
    expect(fs.existsSync(path.join(projectFolder, 'node_modules'))).toBe(false)
    expect(fs.existsSync(path.join(projectFolder, '.git'))).toBe(false)
  }, 15000)

  it('Should fail for already initiated project', () => {
    const directory = path.join(__dirname, 'fixtures', 'initiated-project')
    const commandOutput = runChecklyCreateCli({
      directory,
      promptsInjection: [projectName, 'advanced-project', false, false],
    })

    expectVersionAndName({ commandOutput, latestVersion, greeting })

    const { status, stdout, stderr } = commandOutput

    expect(stderr)
      .toContain('It looks like you already have "__checks__" folder or "checkly.config.ts". ' +
      'Please, remove them and try again.')

    expect(stdout).not.toContain('Downloading example template...')
    expect(stdout).not.toContain('Example template copied!')
    expect(stdout).not.toContain('Installing packages')
    expect(stdout).not.toContain('Packages installed successfully')

    expect(status).toBe(1)
  }, 15000)

  it('Should cancel command and show message', () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const commandOutput = runChecklyCreateCli({
      directory,
      promptsInjection: [new Error()],
    })

    expectVersionAndName({ commandOutput, latestVersion, greeting })
    const { status, stderr } = commandOutput
    expect(stderr).toContain('Bailing, hope to see you again soon!')
    expect(status).toBe(2)
  }, 15000)

  it('Should create projects with all available templates (without installing dependencies)', () => {
    const availableTemplates = PROJECT_TEMPLATES.map(t => t.value)

    availableTemplates.forEach(template => {
      const newProjectName = `${E2E_PROJECT_PREFIX}${uuidv4()}`
      const directory = path.join(__dirname, 'fixtures', 'empty-project')
      const projectFolder = path.join(directory, newProjectName)
      const commandOutput = runChecklyCreateCli({
        directory,
        promptsInjection: [newProjectName, template, false, false],
      })

      expectVersionAndName({ commandOutput, latestVersion, greeting })

      const { status, stdout, stderr } = commandOutput

      expect(stdout).toContain('Downloading example template...')
      expect(stdout).toContain('Example template copied!')
      expect(stdout).not.toContain('Installing packages')
      expect(stdout).not.toContain('Packages installed successfully')

      // no git initialization message
      expect(stdout).toContain('No worries. Just remember to install the dependencies after this setup')

      expectCompleteCreation({ commandOutput, projectFolder })

      expect(stderr).toBe('')
      expect(status).toBe(0)

      expect(fs.existsSync(path.join(projectFolder, 'package.json'))).toBe(true)
      expect(
        fs.existsSync(path.join(projectFolder, 'checkly.config.ts')) ||
        fs.existsSync(path.join(projectFolder, 'checkly.config.js')),
      ).toBe(true)

      // node_modules nor .git shouldn't exist
      expect(fs.existsSync(path.join(projectFolder, 'node_modules'))).toBe(false)
      expect(fs.existsSync(path.join(projectFolder, '.git'))).toBe(false)
    })
  }, 30000)

  it('Should create a project with --template argument', () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const projectFolder = path.join(directory, projectName)
    const commandOutput = runChecklyCreateCli({
      directory,
      args: ['--template', 'boilerplate-project-js'],
      promptsInjection: [projectName, false, false],
    })

    expectVersionAndName({ commandOutput, latestVersion, greeting })

    const { status, stdout, stderr } = commandOutput

    expect(stdout).toContain('Downloading example template...')
    expect(stdout).toContain('Example template copied!')
    expect(stdout).not.toContain('Installing packages')
    expect(stdout).not.toContain('Packages installed successfully')

    // no git initialization message
    expect(stdout).toContain('No worries. Just remember to install the dependencies after this setup')

    expectCompleteCreation({ commandOutput, projectFolder })

    expect(stderr).toBe('')
    expect(status).toBe(0)

    expect(fs.existsSync(path.join(projectFolder, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, 'checkly.config.js'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, '__checks__', 'api.check.js'))).toBe(true)

    // node_modules nor .git shouldn't exist
    expect(fs.existsSync(path.join(projectFolder, 'node_modules'))).toBe(false)
    expect(fs.existsSync(path.join(projectFolder, '.git'))).toBe(false)
  }, 15000)

  it('Should copy the playwright config', () => {
    const directory = path.join(__dirname, 'fixtures', 'playwright-project')
    const commandOutput = runChecklyCreateCli({
      directory,
      promptsInjection: [true, false, false, true],
    })

    expectVersionAndName({ commandOutput, latestVersion, greeting })

    const { status, stdout, stderr } = commandOutput

    expect(stdout).toContain('Downloading example template...')
    expect(stdout).toContain('Example template copied!')
    expect(stdout).not.toContain('Installing packages')
    expect(stdout).not.toContain('Packages installed successfully')
    // no git initialization message

    expect(stdout).toContain('No worries. Just remember to install the dependencies after this setup')
    expect(stdout).toContain('Copying your playwright config')
    expect(stdout).toContain('Playwright config copied!')

    expectCompleteCreation({ commandOutput, projectFolder: directory })

    expect(stderr).toBe('')
    expect(status).toBe(0)

    expect(fs.existsSync(path.join(directory, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(directory, 'checkly.config.ts'))).toBe(true)
    expect(fs.existsSync(path.join(directory, '__checks__', 'api.check.ts'))).toBe(true)

    // node_modules nor .git shouldn't exist
    expect(fs.existsSync(path.join(directory, 'node_modules'))).toBe(false)
  }, 15000)
})
