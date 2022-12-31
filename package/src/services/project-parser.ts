import { BrowserCheck, Project, Session } from '../constructs'
import * as glob from 'glob'
import { loadJsFile, loadTsFile } from './util'
import * as path from 'path'
import { CheckConfigDefaults } from './checkly-config-loader'

type ProjectParseOpts = {
  directory: string,
  projectLogicalId: string,
  projectName: string,
  repoUrl: string,
  checkMatch?: string,
  browserCheckMatch?: string,
  ignoreDirectoriesMatch?: string[],
  checkDefaults?: CheckConfigDefaults,
  browserCheckDefaults?: CheckConfigDefaults,
}

export async function parseProject (opts: ProjectParseOpts): Promise<Project> {
  const {
    directory,
    checkMatch = '**/*.check.{js,ts}',
    browserCheckMatch = '**/*.spec.{js,ts}',
    projectLogicalId,
    projectName,
    repoUrl,
    ignoreDirectoriesMatch = [],
    checkDefaults = {},
    browserCheckDefaults = {},
  } = opts
  const project = new Project(projectLogicalId, {
    name: projectName,
    repoUrl,
  })
  Session.project = project
  Session.basePath = directory
  Session.checkDefaults = checkDefaults
  Session.browserCheckDefaults = browserCheckDefaults

  // TODO: Do we really need all of the ** globs, or could we just put node_modules?
  const ignoreDirectories = ['**/node_modules/**/*', '**/.git/**/*', ...ignoreDirectoriesMatch]
  await loadAllCheckFiles(directory, checkMatch, ignoreDirectories)
  loadAllBrowserChecks(directory, browserCheckMatch, ignoreDirectories, project)

  return project
}

async function loadAllCheckFiles (
  directory: string,
  checkFilePattern: string,
  ignorePattern: string[],
): Promise<void> {
  const checkFiles = findFilesWithPattern(directory, checkFilePattern, ignorePattern)
  for (const checkFile of checkFiles) {
    // setting the checkFilePath is used for filtering by file name on the command line
    Session.checkFilePath = path.relative(directory, checkFile)
    if (checkFile.endsWith('.js')) {
      await loadJsFile(checkFile)
    } else if (checkFile.endsWith('.ts')) {
      await loadTsFile(checkFile)
    } else {
      throw new Error('Unable to load check configuration file with unsupported extension. ' +
        `Please use a .js or .ts file instead.\n${checkFile}`)
    }
    Session.checkFilePath = undefined
  }
}

function loadAllBrowserChecks (
  directory: string,
  browserCheckFilePattern: string,
  ignorePattern: string[],
  project: Project,
): void {
  const checkFiles = findFilesWithPattern(directory, browserCheckFilePattern, ignorePattern)
  const preexistingCheckFiles = new Set<string>()
  Object.values(project.data.checks).forEach(({ scriptPath }) => {
    if (scriptPath) {
      preexistingCheckFiles.add(scriptPath)
    }
  })

  for (const checkFile of checkFiles) {
    const relPath = path.relative(directory, checkFile)
    // Don't create an additional check if the checkFile was already added to a check in loadAllCheckFiles.
    if (preexistingCheckFiles.has(relPath)) {
      continue
    }
    const browserCheck = new BrowserCheck(relPath, {
      name: path.basename(checkFile),
      code: {
        entrypoint: checkFile,
      },
    })
  }
}

function findFilesWithPattern (
  directory: string,
  pattern: string,
  ignorePattern: string[],
): string[] {
  // The files are sorted to make sure that the processing order is deterministic.
  return glob.sync(pattern, {
    nodir: true,
    cwd: directory,
    ignore: ignorePattern,
    absolute: true,
  }).sort()
}
