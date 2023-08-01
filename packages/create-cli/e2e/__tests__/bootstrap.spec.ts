import axios from 'axios'
import * as rimraf from 'rimraf'
import * as path from 'path'
import * as fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { runChecklyCli } from '../run-checkly'
import { getFullName } from '../../src/utils/fullname'
import { PROJECT_TEMPLATES } from '../../src/utils/prompts'
import { SpawnSyncReturns } from 'child_process'

const E2E_PROJECT_PREFIX = 'e2e-test-project-'

function cleanupProjects () {
  rimraf.sync(`${path.join(__dirname, 'fixtures', 'empty-project', E2E_PROJECT_PREFIX)}*`, { glob: true })
}

function expectVersionAndName (
  commandOutput: SpawnSyncReturns<string>,
  latestVersion: string,
  fullUsername: string) {
  expect(commandOutput.stdout).toContain(`v${latestVersion} Build and Run Synthetics That Scale`)
  expect(commandOutput.stdout).toContain(`Hi ${fullUsername}! ` +
    "Let's get you started on your monitoring as code journey!")
}

describe('bootstrap', () => {
  let latestVersion = ''
  let projectName = ''
  let fullUsername = ''
  beforeAll(async () => {
    const packageInformation = await axios.get('https://registry.npmjs.org/checkly/latest')
    latestVersion = packageInformation.data.version
    fullUsername = await getFullName() || ''
  })
  beforeEach(() => {
    projectName = `${E2E_PROJECT_PREFIX}${uuidv4()}`
  })
  afterAll(() => cleanupProjects())

  it('Should create project with advanced-project template', () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const projectFolder = path.join(directory, projectName)
    const commandOutput = runChecklyCli({
      directory,
      version: latestVersion,
      promptsInjection: [projectName, 'advanced-project', true, true],
    })

    const { status, stdout, stderr } = commandOutput

    expectVersionAndName(commandOutput, latestVersion, fullUsername)

    expect(stdout).toContain('- Downloading example template...')
    expect(stdout).toContain('✔ Example template copied!')
    expect(stdout).toContain('- installing packages')
    expect(stdout).toContain('✔ Packages installed successfully')

    expect(stderr).toContain('')
    expect(status).toBe(0)

    expect(fs.existsSync(path.join(projectFolder, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, 'checkly.config.ts'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, 'node_modules'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, '.git'))).toBe(true)
  }, 30000)

  it('Should create an boilerplate-project without installing dependencies', () => {
    const directory = path.join(__dirname, 'fixtures', 'empty-project')
    const projectFolder = path.join(directory, projectName)
    const commandOutput = runChecklyCli({
      directory,
      version: latestVersion,
      promptsInjection: [projectName, 'boilerplate-project', false, false],
    })

    expectVersionAndName(commandOutput, latestVersion, fullUsername)

    const { status, stdout, stderr } = commandOutput

    expect(stdout).toContain('- Downloading example template...')
    expect(stdout).toContain('✔ Example template copied!')
    expect(stdout).not.toContain('- installing packages')
    expect(stdout).not.toContain('✔ Packages installed successfully')

    expect(stderr).toContain('')
    expect(status).toBe(0)

    expect(fs.existsSync(path.join(projectFolder, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectFolder, 'checkly.config.ts'))).toBe(true)

    // node_modules nor .git shouldn't exist
    expect(fs.existsSync(path.join(projectFolder, 'node_modules'))).toBe(false)
    expect(fs.existsSync(path.join(projectFolder, '.git'))).toBe(false)
  }, 15000)

  it('Should fail for already initiated project', () => {
    const directory = path.join(__dirname, 'fixtures', 'initiated-project')
    const commandOutput = runChecklyCli({
      directory,
      version: latestVersion,
      promptsInjection: [projectName, 'advanced-project', false, false],
    })

    expectVersionAndName(commandOutput, latestVersion, fullUsername)

    const { status, stdout, stderr } = commandOutput

    expect(stdout).not.toContain('- Downloading example template...')
    expect(stdout).not.toContain('✔ Example template copied!')
    expect(stdout).not.toContain('- installing packages')
    expect(stdout).not.toContain('✔ Packages installed successfully')

    expect(stderr)
      .toContain('It looks like you already have "__checks__" folder or "checkly.config.ts". ' +
        'Please, remove them and try again.')

    expect(status).toBe(1)
  }, 15000)

  it('Should create projects with all available templates (without installing dependencies)', () => {
    const availableTemplates = PROJECT_TEMPLATES.map(t => t.value)

    availableTemplates.forEach(template => {
      const newProjectName = `${E2E_PROJECT_PREFIX}${uuidv4()}`
      const directory = path.join(__dirname, 'fixtures', 'empty-project')
      const projectFolder = path.join(directory, newProjectName)
      const commandOutput = runChecklyCli({
        directory,
        version: latestVersion,
        promptsInjection: [newProjectName, template, false, false],
      })

      expectVersionAndName(commandOutput, latestVersion, fullUsername)

      const { status, stdout, stderr } = commandOutput

      expect(stdout).toContain('- Downloading example template...')
      expect(stdout).toContain('✔ Example template copied!')
      expect(stdout).not.toContain('- installing packages')
      expect(stdout).not.toContain('✔ Packages installed successfully')

      expect(stderr).toContain('')
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
})
