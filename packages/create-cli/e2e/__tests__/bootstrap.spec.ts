import path from 'node:path'
import fs from 'node:fs/promises'

import axios from 'axios'
import * as rimraf from 'rimraf'
import { v4 as uuidv4 } from 'uuid'
import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest'

import { runChecklyCreateCli } from '../run-create-cli'
import { getUserGreeting } from '../../src/utils/messages'
import { PROJECT_TEMPLATES } from '../../src/utils/prompts'
import { ExecaReturnValue } from 'execa'

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
  commandOutput: ExecaReturnValue<string>
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
  commandOutput: ExecaReturnValue<string>
  projectFolder: string
}) {
  expect(commandOutput.stdout).toContain(`All done. Time to get testing & monitoring with Checkly

         > Enter your project directory using cd ${projectFolder}
         > Run npx checkly login to login to your Checkly account or create a free new account
         > Run npx checkly test --record to dry run your checks
         > Run npx checkly deploy to deploy your checks to the Checkly cloud

         Questions?

         - Check the docs at https://checklyhq.com/docs/cli
         - Join the Checkly Slack community at https://checklyhq.com/slack`)
}

async function exists (filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
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

  it('Should create project with advanced-project template', async () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const projectFolder = path.join(directory, projectName)
    const commandOutput = await runChecklyCreateCli({
      directory,
      promptsInjection: [projectName, 'advanced-project', true, true],
      timeout: 180_000,
    })

    const { exitCode, stdout, stderr } = commandOutput

    expectVersionAndName({ commandOutput, latestVersion, greeting })

    expect(stdout).toContain('Downloading example template...')
    expect(stdout).toContain('Example template copied!')
    expect(stdout).toContain('Installing packages')
    expect(stdout).toContain('Packages installed successfully')

    expect(stderr).toBe('')
    expect(exitCode).toBe(0)

    await expect(exists(path.join(projectFolder, 'package.json'))).resolves.toBe(true)
    await expect(exists(path.join(projectFolder, 'checkly.config.ts'))).resolves.toBe(true)
    await expect(exists(path.join(projectFolder, 'node_modules'))).resolves.toBe(true)
    await expect(exists(path.join(projectFolder, '.git'))).resolves.toBe(true)
  }, 180_000)

  it('Should create an boilerplate-project without installing dependencies', async () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const projectFolder = path.join(directory, projectName)
    const commandOutput = await runChecklyCreateCli({
      directory,
      promptsInjection: [projectName, 'boilerplate-project', false, false],
    })

    expectVersionAndName({ commandOutput, latestVersion, greeting })

    const { exitCode, stdout, stderr } = commandOutput

    expect(stdout).toContain('Downloading example template...')
    expect(stdout).toContain('Example template copied!')
    expect(stdout).not.toContain('Installing packages')
    expect(stdout).not.toContain('Packages installed successfully')

    // no git initialization message
    expect(stdout).toContain('No worries. Just remember to install the dependencies after this setup')

    expectCompleteCreation({ commandOutput, projectFolder })

    expect(stderr).toBe('')
    expect(exitCode).toBe(0)

    await expect(exists(path.join(projectFolder, 'package.json'))).resolves.toBe(true)
    await expect(exists(path.join(projectFolder, 'checkly.config.ts'))).resolves.toBe(true)

    // node_modules nor .git shouldn't exist
    await expect(exists(path.join(projectFolder, 'node_modules'))).resolves.toBe(false)
    await expect(exists(path.join(projectFolder, '.git'))).resolves.toBe(false)
  }, 15000)

  it('Should create an boilerplate-project using an older version', async () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const projectFolder = path.join(directory, projectName)
    const version = '4.0.13'
    const commandOutput = await runChecklyCreateCli({
      directory,
      version,
      promptsInjection: [projectName, 'boilerplate-project', false, false],
    })

    expectVersionAndName({ commandOutput, version, latestVersion, greeting })

    const { exitCode, stdout, stderr } = commandOutput

    expect(stdout).toContain('Downloading example template...')
    expect(stdout).toContain('Example template copied!')
    expect(stdout).not.toContain('Installing packages')
    expect(stdout).not.toContain('Packages installed successfully')

    // no git initialization message
    expect(stdout).toContain('No worries. Just remember to install the dependencies after this setup')

    expectCompleteCreation({ commandOutput, projectFolder })

    expect(stderr).toBe('')
    expect(exitCode).toBe(0)

    await expect(exists(path.join(projectFolder, 'package.json'))).resolves.toBe(true)
    await expect(exists(path.join(projectFolder, 'checkly.config.ts'))).resolves.toBe(true)

    // node_modules nor .git shouldn't exist
    await expect(exists(path.join(projectFolder, 'node_modules'))).resolves.toBe(false)
    await expect(exists(path.join(projectFolder, '.git'))).resolves.toBe(false)
  }, 15000)

  it('Should fail for already initiated project', async () => {
    const directory = path.join(__dirname, 'fixtures', 'initiated-project')
    const commandOutput = await runChecklyCreateCli({
      directory,
      promptsInjection: [projectName, 'advanced-project', false, false],
    })

    expectVersionAndName({ commandOutput, latestVersion, greeting })

    const { exitCode, stdout, stderr } = commandOutput

    expect(stderr)
      .toContain('It looks like you already have "__checks__" folder or "checkly.config.ts". ' +
      'Please, remove them and try again.')

    expect(stdout).not.toContain('Downloading example template...')
    expect(stdout).not.toContain('Example template copied!')
    expect(stdout).not.toContain('Installing packages')
    expect(stdout).not.toContain('Packages installed successfully')

    expect(exitCode).toBe(1)
  }, 15000)

  it('Should cancel command and show message', async () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const commandOutput = await runChecklyCreateCli({
      directory,
      promptsInjection: [new Error()],
    })

    expectVersionAndName({ commandOutput, latestVersion, greeting })
    const { exitCode, stderr } = commandOutput
    expect(stderr).toContain('Bailing, hope to see you again soon!')
    expect(exitCode).toBe(2)
  }, 15000)

  it('Should create projects with all available templates (without installing dependencies)', async () => {
    const availableTemplates = PROJECT_TEMPLATES.map(t => t.value)

    for (const template of availableTemplates) {
      const newProjectName = `${E2E_PROJECT_PREFIX}${uuidv4()}`
      const directory = path.join(__dirname, 'fixtures', 'empty-project')
      const projectFolder = path.join(directory, newProjectName)
      const commandOutput = await runChecklyCreateCli({
        directory,
        promptsInjection: [newProjectName, template, false, false],
      })

      expectVersionAndName({ commandOutput, latestVersion, greeting })

      const { exitCode, stdout, stderr } = commandOutput

      expect(stdout).toContain('Downloading example template...')
      expect(stdout).toContain('Example template copied!')
      expect(stdout).not.toContain('Installing packages')
      expect(stdout).not.toContain('Packages installed successfully')

      // no git initialization message
      expect(stdout).toContain('No worries. Just remember to install the dependencies after this setup')

      expectCompleteCreation({ commandOutput, projectFolder })

      expect(stderr).toBe('')
      expect(exitCode).toBe(0)

      await expect(exists(path.join(projectFolder, 'package.json'))).resolves.toBe(true)
      await expect(Promise.all([
        exists(path.join(projectFolder, 'checkly.config.ts')),
        exists(path.join(projectFolder, 'checkly.config.js')),
      ])).resolves.toContain(true)

      // node_modules nor .git shouldn't exist
      await expect(exists(path.join(projectFolder, 'node_modules'))).resolves.toBe(false)
      await expect(exists(path.join(projectFolder, '.git'))).resolves.toBe(false)
    }
  }, 30000)

  it('Should create a project with --template argument', async () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const projectFolder = path.join(directory, projectName)
    const commandOutput = await runChecklyCreateCli({
      directory,
      args: ['--template', 'boilerplate-project-js'],
      promptsInjection: [projectName, false, false],
    })

    expectVersionAndName({ commandOutput, latestVersion, greeting })

    const { exitCode, stdout, stderr } = commandOutput

    expect(stdout).toContain('Downloading example template...')
    expect(stdout).toContain('Example template copied!')
    expect(stdout).not.toContain('Installing packages')
    expect(stdout).not.toContain('Packages installed successfully')

    // no git initialization message
    expect(stdout).toContain('No worries. Just remember to install the dependencies after this setup')

    expectCompleteCreation({ commandOutput, projectFolder })

    expect(stderr).toBe('')
    expect(exitCode).toBe(0)

    await expect(exists(path.join(projectFolder, 'package.json'))).resolves.toBe(true)
    await expect(exists(path.join(projectFolder, 'checkly.config.js'))).resolves.toBe(true)
    await expect(exists(path.join(projectFolder, '__checks__', 'api.check.js'))).resolves.toBe(true)

    // node_modules nor .git shouldn't exist
    await expect(exists(path.join(projectFolder, 'node_modules'))).resolves.toBe(false)
    await expect(exists(path.join(projectFolder, '.git'))).resolves.toBe(false)
  }, 15000)

  it('Should copy the playwright config', async () => {
    const directory = path.join(__dirname, 'fixtures', 'playwright-project')
    const commandOutput = await runChecklyCreateCli({
      directory,
      promptsInjection: [true, false, false, true],
    })

    expectVersionAndName({ commandOutput, latestVersion, greeting })

    const { exitCode, stdout, stderr } = commandOutput

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
    expect(exitCode).toBe(0)

    await expect(exists(path.join(directory, 'package.json'))).resolves.toBe(true)
    await expect(exists(path.join(directory, 'checkly.config.ts'))).resolves.toBe(true)
    await expect(exists(path.join(directory, '__checks__', 'api.check.ts'))).resolves.toBe(true)

    // node_modules nor .git shouldn't exist
    await expect(exists(path.join(directory, 'node_modules'))).resolves.toBe(false)
  }, 15000)
})
