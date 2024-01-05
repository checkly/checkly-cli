import Debug from 'debug'
import { copyTemporaryFiles, generateProjectName, usePackageName, readPackageJson, hasPackageJsonFile, checkFilesToKeep } from './directory'
import { askCopyPlaywrightProject, askInitializeProject, askProjectDirectory, askTemplate } from './prompts'
import { addDevDependecies, installDependencies } from '../actions/dependencies'
import { copyTemplate } from '../actions/template'
import { createCustomBrowserCheck } from '../actions/creates'
import { initGit } from '../actions/git'
import * as playwright from '../actions/playwright'

const debug = Debug('checkly:create-cli')
const templateBaseRepo = 'checkly/checkly-cli/examples'

export async function getProjectDirectory ({ onCancel }: { onCancel: () => void }): Promise<string> {
  debug('Ask or detect directory name')
  const cwd = process.cwd()

  // if directory has a package.json, do not ask project directory and use CWD
  const { projectDirectory } = hasPackageJsonFile(cwd)
    ? { projectDirectory: cwd }
    : await askProjectDirectory(onCancel)

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

    const FILE_TO_KEEP = ['__checks__', 'checkly.config.ts']
    checkFilesToKeep(FILE_TO_KEEP, projectDirectory)

    debug('Copy boilerplate project to temporary folder')
    await copyTemplate({
      template: 'boilerplate-project',
      templatePath: `github:${templateBaseRepo}/boilerplate-project#${version}`,
      targetDir: temporaryDir,
    })

    copyTemporaryFiles(FILE_TO_KEEP, projectDirectory, temporaryDir)
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
    templatePath: `github:${templateBaseRepo}/${templateResponse.template}#${version}`,
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

export async function copyPlaywrightConfig ({ projectDirectory, playwrightConfig }:
                                                { projectDirectory: string, playwrightConfig: string }) {
  debug('Check if playwright config exists in project')
  const { shouldCopyPlaywrightConfig } = await askCopyPlaywrightProject(projectDirectory)
  if (shouldCopyPlaywrightConfig) {
    await playwright.copyPlaywrightConfig(projectDirectory, playwrightConfig)
  }
}
