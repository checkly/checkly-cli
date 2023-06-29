import Debug from 'debug'
import { copyTemporaryFiles, generateProjectName, usePackageName, readPackageJson } from './directory.js'
import { askInitializeProject, askProjectDirectory, askTemplate } from './prompts.js'
import { addDevDependecies, installDependencies } from '../actions/dependencies.js'
import { copyTemplate } from '../actions/template.js'
import { createCustomBrowserCheck } from '../actions/creates.js'
import { initGit } from '../actions/git.js'

const debug = Debug('checkly:create-cli')
const templateBaseRepo = 'checkly/checkly-cli/examples'

export async function getProjectDirectory ({ onCancel }: { onCancel: () => void }): Promise<string> {
  debug('Ask for directory name')
  const { projectDirectory } = await askProjectDirectory(onCancel)

  if (!projectDirectory) {
    process.stderr.write('You must provide a valid directory name. Please try again.')
  }

  return projectDirectory
}

export async function installWithinProject (
  { projectDirectory, version, onCancel }: { projectDirectory: string, version: string, onCancel: () => void }) {
  debug('Existing package.json detected')
  const { initializeProject } = await askInitializeProject(onCancel)

  if (initializeProject) {
    const packageJson = readPackageJson(projectDirectory)
    const temporaryDir = generateProjectName()

    debug('Add dependencies to existing package.json')
    addDevDependecies(projectDirectory, packageJson)

    debug('Copy boilerplate project to temporary folder')
    await copyTemplate({
      template: 'boilerplate-project',
      templatePath: `github:${templateBaseRepo}/boilerplate-project#v${version}`,
      targetDir: temporaryDir,
    })

    copyTemporaryFiles(projectDirectory, temporaryDir)
    usePackageName(packageJson.name)

    debug('Create custom Browser check')
    await createCustomBrowserCheck({ projectDirectory, onCancel })
  } else {
    process.exit(0)
  }
}

export async function createProject (
  { projectDirectory, version, onCancel }: { projectDirectory: string, version: string, onCancel: () => void }) {
  const templateResponse = await askTemplate(onCancel)

  debug('Downloading template')
  await copyTemplate({
    template: templateResponse.template,
    templatePath: `github:${templateBaseRepo}/${templateResponse.template}#v${version}`,
    targetDir: projectDirectory,
  })
}

export async function installDependenciesAndInitGit (
  { projectDirectory }: { projectDirectory: string }) {
  debug('Install npm dependencies')
  await installDependencies(projectDirectory)

  debug('Init .git & .gitignore')
  await initGit(projectDirectory)
}
