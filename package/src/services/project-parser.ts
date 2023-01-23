import { BrowserCheck, Project, Session } from '../constructs'
import { promisify } from 'util'
import * as glob from 'glob'
import { loadJsFile, loadTsFile } from './util'
import * as path from 'path'
import { CheckConfigDefaults } from './checkly-config-loader'

import type { Runtime } from '../rest/runtimes'

const globPromise = promisify(glob)

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
  availableRuntimes: Record<string, Runtime>
}

const BASE_CHECK_DEFAULTS = {
  runtimeId: '2022.10',
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
    availableRuntimes,
  } = opts
  const project = new Project(projectLogicalId, {
    name: projectName,
    repoUrl,
  })
  Session.project = project
  Session.basePath = directory
  Session.checkDefaults = Object.assign({}, BASE_CHECK_DEFAULTS, checkDefaults)
  Session.browserCheckDefaults = browserCheckDefaults
  Session.availableRuntimes = availableRuntimes

  // TODO: Do we really need all of the ** globs, or could we just put node_modules?
  const ignoreDirectories = ['**/node_modules/**', '**/.git/**', ...ignoreDirectoriesMatch]
  await loadAllCheckFiles(directory, checkMatch, ignoreDirectories)
  await loadAllBrowserChecks(directory, browserCheckMatch, ignoreDirectories, project)

  return project
}

async function loadAllCheckFiles (
  directory: string,
  checkFilePattern: string,
  ignorePattern: string[],
): Promise<void> {
  const checkFiles = await findFilesWithPattern(directory, checkFilePattern, ignorePattern)
  for (const checkFile of checkFiles) {
    // setting the checkFilePath is used for filtering by file name on the command line
    Session.checkFileAbsolutePath = checkFile
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
    Session.checkFileAbsolutePath = undefined
  }
}

async function loadAllBrowserChecks (
  directory: string,
  browserCheckFilePattern: string,
  ignorePattern: string[],
  project: Project,
): Promise<void> {
  const checkFiles = await findFilesWithPattern(directory, browserCheckFilePattern, ignorePattern)
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

async function findFilesWithPattern (
  directory: string,
  pattern: string,
  ignorePattern: string[],
): Promise<string[]> {
  // The files are sorted to make sure that the processing order is deterministic.
  const files = await globPromise(pattern, {
    nodir: true,
    cwd: directory,
    ignore: ignorePattern,
    absolute: true,
  })
  return files.sort()
}
