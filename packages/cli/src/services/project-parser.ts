import * as glob from 'glob'
import * as path from 'path'
import { promisify } from 'util'
import { loadJsFile, loadTsFile, pathToPosix } from './util'
import {
  BrowserCheck, Project, Session,
  PrivateLocation, PrivateLocationCheckAssignment, PrivateLocationGroupAssignment,
} from '../constructs'
import { Ref } from '../constructs/ref'
import { CheckConfigDefaults } from './checkly-config-loader'

import type { Runtime } from '../rest/runtimes'
import type { Construct } from '../constructs/construct'

const globPromise = promisify(glob)

type ProjectParseOpts = {
  directory: string,
  projectLogicalId: string,
  projectName: string,
  repoUrl?: string,
  checkMatch?: string,
  browserCheckMatch?: string,
  ignoreDirectoriesMatch?: string[],
  checkDefaults?: CheckConfigDefaults,
  browserCheckDefaults?: CheckConfigDefaults,
  availableRuntimes: Record<string, Runtime>,
  checklyConfigConstructs?: Construct[],
}

const BASE_CHECK_DEFAULTS = {
  runtimeId: '2023.02',
}

export async function parseProject (opts: ProjectParseOpts): Promise<Project> {
  const {
    directory,
    checkMatch = '**/*.check.{js,ts}',
    browserCheckMatch,
    projectLogicalId,
    projectName,
    repoUrl,
    ignoreDirectoriesMatch = [],
    checkDefaults = {},
    browserCheckDefaults = {},
    availableRuntimes,
    checklyConfigConstructs,
  } = opts
  const project = new Project(projectLogicalId, {
    name: projectName,
    repoUrl,
  })
  checklyConfigConstructs?.forEach(
    (construct) => project.addResource(construct.type, construct.logicalId, construct),
  )
  Session.project = project
  Session.basePath = directory
  Session.checkDefaults = Object.assign({}, BASE_CHECK_DEFAULTS, checkDefaults)
  Session.browserCheckDefaults = browserCheckDefaults
  Session.availableRuntimes = availableRuntimes

  // TODO: Do we really need all of the ** globs, or could we just put node_modules?
  const ignoreDirectories = ['**/node_modules/**', '**/.git/**', ...ignoreDirectoriesMatch]
  await loadAllCheckFiles(directory, checkMatch, ignoreDirectories)
  await loadAllBrowserChecks(directory, browserCheckMatch, ignoreDirectories, project)

  // private-location must be processed after all checks and groups are loaded.
  await loadAllPrivateLocationsSlugNames(project)

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
    Session.checkFilePath = pathToPosix(path.relative(directory, checkFile))
    if (checkFile.endsWith('.js')) {
      await loadJsFile(checkFile)
    } else if (checkFile.endsWith('.mjs')) {
      await loadJsFile(checkFile)
    } else if (checkFile.endsWith('.ts')) {
      await loadTsFile(checkFile)
    } else {
      throw new Error('Unable to load check configuration file with unsupported extension. ' +
      `Please use a .js, .msj  or .ts file instead.\n${checkFile}`)
    }
    Session.checkFilePath = undefined
    Session.checkFileAbsolutePath = undefined
  }
}

async function loadAllBrowserChecks (
  directory: string,
  browserCheckFilePattern: string | undefined,
  ignorePattern: string[],
  project: Project,
): Promise<void> {
  if (!browserCheckFilePattern) {
    return
  }
  const checkFiles = await findFilesWithPattern(directory, browserCheckFilePattern, ignorePattern)
  const preexistingCheckFiles = new Set<string>()
  Object.values(project.data.check).forEach((check) => {
    if (check instanceof BrowserCheck && check.scriptPath) {
      preexistingCheckFiles.add(check.scriptPath)
    }
  })

  for (const checkFile of checkFiles) {
    const relPath = pathToPosix(path.relative(directory, checkFile))
    // Don't create an additional check if the checkFile was already added to a check in loadAllCheckFiles.
    if (preexistingCheckFiles.has(relPath)) {
      continue
    }
    const browserCheck = new BrowserCheck(pathToPosix(relPath), {
      name: path.basename(checkFile),
      code: {
        entrypoint: checkFile,
      },
    })
  }
}

async function loadAllPrivateLocationsSlugNames (
  project: Project,
): Promise<void> {
  const privateLocations = await Session.getPrivateLocations()

  // search for slugNames in Checks and create non-member private-location if needed
  const checksWithSlugNames = Object.values(project.data.check)
    .filter(c => c.privateLocations?.some(pl => typeof pl === 'string'))

  checksWithSlugNames.forEach(c => {
    const checkSlugNames = c.privateLocations?.filter(pl => typeof pl === 'string') ?? []

    checkSlugNames.forEach(csn => {
      const privateLocation = privateLocations.find(pl => pl.slugName === csn)
      if (!privateLocation) {
        throw new Error(`Check '${c.logicalId}' is using a private-location '${csn}' not found in your account. Please, review your configuration and try again.`)
      }

      // only create the non member private-location if it wasn't already added
      const projectPrivateLocation = Object.values(project.data['private-location']).find(pl => pl.physicalId === privateLocation.id)
      let privateLocationLogicalId = ''
      if (!projectPrivateLocation) {
        const nonMemberPrivateLocation = PrivateLocation.fromId(privateLocation.id)
        privateLocationLogicalId = nonMemberPrivateLocation.logicalId
      } else {
        privateLocationLogicalId = projectPrivateLocation.logicalId
      }

      // create the private-location/check assignment
      const checkAssignment = new PrivateLocationCheckAssignment(`private-location-check-assignment#${c.logicalId}#${privateLocationLogicalId}`, {
        privateLocationId: Ref.from(privateLocationLogicalId),
        checkId: Ref.from(c.logicalId),
      })
    })
  })

  // search for slugNames in Check-groups and create non-member private-location if needed
  const groupsWithSlugNames = Object.values(project.data['check-group'])
    .filter(g => g.privateLocations?.some(pl => typeof pl === 'string'))

  groupsWithSlugNames.forEach(g => {
    const groupSlugNames = g.privateLocations?.filter(pl => typeof pl === 'string') ?? []

    groupSlugNames.forEach(gsn => {
      const privateLocation = privateLocations.find(pl => pl.slugName === gsn)
      if (!privateLocation) {
        throw new Error(`Check-group '${g.logicalId}' is using a private-location '${gsn}' not found in your account. Please, review your configuration and try again.`)
      }

      // only create the non member private-location if it wasn't already added
      const projectPrivateLocation = Object.values(project.data['private-location']).find(pl => pl.physicalId === privateLocation.id)
      let privateLocationLogicalId = ''
      if (!projectPrivateLocation) {
        const nonMemberPrivateLocation = PrivateLocation.fromId(privateLocation.id)
        privateLocationLogicalId = nonMemberPrivateLocation.logicalId
      } else {
        privateLocationLogicalId = projectPrivateLocation.logicalId
      }

      // create the private-location/check-group assignment
      const groupAssignment = new PrivateLocationGroupAssignment(`private-location-group-assignment#${g.logicalId}#${privateLocationLogicalId}#`, {
        privateLocationId: Ref.from(privateLocationLogicalId),
        groupId: Ref.from(g.logicalId),
      })
    })
  })
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
