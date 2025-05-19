import * as path from 'path'
import { findFilesWithPattern, pathToPosix } from './util'
import {
  Check, BrowserCheck, CheckGroup, Project, Session,
  PrivateLocation, PrivateLocationCheckAssignment, PrivateLocationGroupAssignment, MultiStepCheck,
} from '../constructs'
import { Ref } from '../constructs/ref'
import { CheckConfigDefaults } from './checkly-config-loader'

import type { Runtime } from '../rest/runtimes'
import type { Construct } from '../constructs/construct'

type ProjectParseOpts = {
  directory: string,
  projectLogicalId: string,
  projectName: string,
  repoUrl?: string,
  checkMatch?: string | string[],
  browserCheckMatch?: string | string[],
  multiStepCheckMatch?: string | string[],
  ignoreDirectoriesMatch?: string[],
  checkDefaults?: CheckConfigDefaults,
  browserCheckDefaults?: CheckConfigDefaults,
  availableRuntimes: Record<string, Runtime>,
  defaultRuntimeId: string,
  verifyRuntimeDependencies?: boolean,
  checklyConfigConstructs?: Construct[],
}

const BASE_CHECK_DEFAULTS = {
}

export async function parseProject (opts: ProjectParseOpts): Promise<Project> {
  const {
    directory,
    checkMatch = '**/*.check.{js,ts}',
    browserCheckMatch,
    multiStepCheckMatch,
    projectLogicalId,
    projectName,
    repoUrl,
    ignoreDirectoriesMatch = [],
    checkDefaults = {},
    browserCheckDefaults = {},
    availableRuntimes,
    defaultRuntimeId,
    verifyRuntimeDependencies,
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
  Session.defaultRuntimeId = defaultRuntimeId
  Session.verifyRuntimeDependencies = verifyRuntimeDependencies ?? true

  // TODO: Do we really need all of the ** globs, or could we just put node_modules?
  const ignoreDirectories = ['**/node_modules/**', '**/.git/**', ...ignoreDirectoriesMatch]
  await loadAllCheckFiles(directory, checkMatch, ignoreDirectories)
  await loadAllBrowserChecks(directory, browserCheckMatch, ignoreDirectories, project)
  await loadAllMultiStepChecks(directory, multiStepCheckMatch, ignoreDirectories, project)

  // private-location must be processed after all checks and groups are loaded.
  await loadAllPrivateLocationsSlugNames(project)

  return project
}

async function loadAllCheckFiles (
  directory: string,
  checkFilePattern: string | string[],
  ignorePattern: string[],
): Promise<void> {
  const checkFiles = await findFilesWithPattern(directory, checkFilePattern, ignorePattern)
  for (const checkFile of checkFiles) {
    // setting the checkFilePath is used for filtering by file name on the command line
    Session.checkFileAbsolutePath = checkFile
    Session.checkFilePath = pathToPosix(path.relative(directory, checkFile))
    await Session.loadFile(checkFile)
    Session.checkFilePath = undefined
    Session.checkFileAbsolutePath = undefined
  }
}

async function loadAllBrowserChecks (
  directory: string,
  browserCheckFilePattern: string | string[] | undefined,
  ignorePattern: string[],
  project: Project,
): Promise<void> {
  if (!browserCheckFilePattern) {
    return
  }
  const checkFiles = await findFilesWithPattern(directory, browserCheckFilePattern, ignorePattern)
  const preexistingCheckFiles = new Set<string>()
  Object.values(project.data.check).forEach((check) => {
    if ((check instanceof BrowserCheck || check instanceof MultiStepCheck) && check.scriptPath) {
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

async function loadAllMultiStepChecks (
  directory: string,
  multiStepCheckFilePattern: string | string[] | undefined,
  ignorePattern: string[],
  project: Project,
): Promise<void> {
  if (!multiStepCheckFilePattern) {
    return
  }
  const checkFiles = await findFilesWithPattern(directory, multiStepCheckFilePattern, ignorePattern)
  const preexistingCheckFiles = new Set<string>()
  Object.values(project.data.check).forEach((check) => {
    if ((check instanceof MultiStepCheck || check instanceof BrowserCheck) && check.scriptPath) {
      preexistingCheckFiles.add(check.scriptPath)
    }
  })

  for (const checkFile of checkFiles) {
    const relPath = pathToPosix(path.relative(directory, checkFile))
    // Don't create an additional check if the checkFile was already added to a check in loadAllCheckFiles.
    if (preexistingCheckFiles.has(relPath)) {
      continue
    }
    const multistepCheck = new MultiStepCheck(pathToPosix(relPath), {
      name: path.basename(checkFile),
      code: {
        entrypoint: checkFile,
      },
    })
  }
}

// TODO: create a function to process slug names for check or check-group to reduce duplicated code.
async function loadAllPrivateLocationsSlugNames (
  project: Project,
): Promise<void> {
  /**
   * Search for slug names in all Checks and CheckGroups privateLocations properties. Then, create non-member
   * private-locations and assigments if needed.
   * This logic allow as to get the private-location id searching by slug names and make use
   * of PrivateLocation.fromId() under the hood.
   */
  const resourcesWithSlugNames: Array<Check|CheckGroup> =
    [...Object.values(project.data.check), ...Object.values(project.data['check-group'])]
      .filter(g => g.privateLocations?.some(pl => typeof pl === 'string'))

  if (!resourcesWithSlugNames.length) {
    return
  }

  const privateLocations = await Session.getPrivateLocations()

  resourcesWithSlugNames.forEach(resource => {
    // only slug names strings are processed here, the instances referenced are handle by the resource class
    const resourceSlugNames = resource.privateLocations?.filter(pl => typeof pl === 'string') ?? []

    resourceSlugNames.forEach(sn => {
      // check if the slug name could be replaced by the instance within the project
      const isSlugNameFromProjectPrivateLocation = Object.values(project.data['private-location']).find(pl => pl.slugName === sn)
      if (isSlugNameFromProjectPrivateLocation) {
        throw new Error(`${resource.constructor.name} '${resource.logicalId}' is using a slug name '${sn}' to reference project private-location. Please, replace the slug name with the instance.`)
      }

      const privateLocation = privateLocations.find(pl => pl.slugName === sn)
      if (!privateLocation) {
        throw new Error(`${resource.constructor.name} '${resource.logicalId}' is using a private-location '${sn}' not found in your account. Please, review your configuration and try again.`)
      }

      // only create the non member private-location if it wasn't already added
      const privateLocationAlreadyCreated = Object.values(project.data['private-location']).find(pl => pl.physicalId === privateLocation.id)
      let privateLocationLogicalId = ''
      if (!privateLocationAlreadyCreated) {
        const nonMemberPrivateLocation = PrivateLocation.fromId(privateLocation.id)
        privateLocationLogicalId = nonMemberPrivateLocation.logicalId
      } else {
        privateLocationLogicalId = privateLocationAlreadyCreated.logicalId
      }

      // create the private-location/check assignment
      const assignment = resource instanceof Check
        ? new PrivateLocationCheckAssignment(`private-location-check-assignment#${resource.logicalId}#${privateLocationLogicalId}`, {
          privateLocationId: Ref.from(privateLocationLogicalId),
          checkId: Ref.from(resource.logicalId),
        })
        : new PrivateLocationGroupAssignment(`private-location-group-assignment#${resource.logicalId}#${privateLocationLogicalId}`, {
          privateLocationId: Ref.from(privateLocationLogicalId),
          groupId: Ref.from(resource.logicalId),
        })
    })
  })
}
