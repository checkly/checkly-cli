import Debug from 'debug'
import { copyTemporaryFiles, generateProjectName, usePackageName } from './directory.js'
import { askInitializeProject, askProjectDirectory, askTemplate } from './prompts.js'
import { footer, hint } from './messages.js'
import { readPackageJson } from './package.js'
import { addDevDependecies, installDependencies } from '../actions/dependencies.js'
import { copyTemplate } from '../actions/template.js'
import { createCustomBrowserCheck } from '../actions/creates.js'
import { initGit } from '../actions/git.js'

const debug = Debug('checkly:create-cli')
const templateBaseRepo = 'checkly/checkly-cli/examples'

export async function installWithinProject ({ version, onCancel }: { version: string, onCancel: () => void }) {
  debug('Existing package.json detected')
  const { initializeProject } = await askInitializeProject(onCancel)

  if (initializeProject) {
    const packageJson = readPackageJson()
    const temporaryDir = generateProjectName()

    debug('Add dependencies to existing package.json')
    addDevDependecies(packageJson)

    debug('Copy boilerplate project to temporary folder')
    await copyTemplate({
      template: 'boilerplate-project',
      templatePath: `github:${templateBaseRepo}/boilerplate-project#v${version}`,
      targetDir: temporaryDir,
    })

    copyTemporaryFiles(temporaryDir)
    usePackageName(packageJson.name)

    debug('Create custom Browser check')
    await createCustomBrowserCheck({ onCancel })

    debug('Install npm dependencies')
    await installDependencies()

    debug('Init .git & .gitignore')
    await initGit()

    await footer()
  }
}

export async function createProject ({ version, onCancel }: { version: string, onCancel: () => void }) {
  debug('Ask for directory name')
  const { projectDirectory } = await askProjectDirectory(onCancel)

  if (!projectDirectory) {
    process.stderr.write('You must provide a valid directory name. Please try again.')
  }

  await hint('Cool.', `Your project will be created in the directory "${projectDirectory}"`)

  const templateResponse = await askTemplate(onCancel)

  debug('Downloading template')
  await copyTemplate({
    template: templateResponse.template,
    templatePath: `github:${templateBaseRepo}/${templateResponse.template}#v${version}`,
    targetDir: projectDirectory,
  })

  debug('Install npm dependencies')
  await installDependencies(projectDirectory)

  debug('Init .git & .gitignore')
  await initGit(projectDirectory)

  await footer(projectDirectory)
}
