import { BrowserCheck, Project, Session } from '../constructs'
import * as glob from 'glob'
import { loadJsFile, loadTsFile } from './util'
import * as path from 'path'

type ProjectParseOpts = {
  directory: string,
  projectLogicalId: string,
  projectName: string,
  repoUrl: string,
  checkMatch?: string,
  browserCheckMatch?: string,
  ignoreDirectoriesMatch?: string[],
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
  } = opts
  const project = new Project(projectLogicalId, {
    name: projectName,
    repoUrl,
  })
  Session.project = project
  Session.basePath = directory

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
    if (checkFile.endsWith('.js')) {
      await loadJsFile(checkFile)
    } else if (checkFile.endsWith('.ts')) {
      await loadTsFile(checkFile)
    } else {
      throw new Error('Unable to load check configuration file with unsupported extension. ' +
        `Please use a .js or .ts file instead.\n${checkFile}`)
    }
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
      activated: true,
      muted: false,
      locations: ['eu-central-1'],
      code: {
        entrypoint: checkFile,
      },
      // TODO: Apply the base configuration
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
