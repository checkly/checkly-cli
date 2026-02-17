import * as path from 'path'
import Debug from 'debug'
import {
  findFilesWithPattern, getPlaywrightConfigPath,
  pathToPosix,
} from './util'
import {
  Check, BrowserCheck, CheckGroup, Project, Session,
  PrivateLocation, PrivateLocationCheckAssignment, PrivateLocationGroupAssignment, MultiStepCheck,
  CheckFilter,
} from '../constructs'
import { Ref } from '../constructs/ref'
import { CheckConfigDefaults, PlaywrightSlimmedProp } from './checkly-config-loader'
import { isEntrypoint, type Construct } from '../constructs/construct'
import { PlaywrightCheck } from '../constructs/playwright-check'
import {
  detectNearestPackageJson,
  detectPackageManager,
  fauxWorkspaceFromPackageJson,
  NoPackageJsonFoundError,
  PackageManager,
} from './check-parser/package-files/package-manager'
import { Err, Ok, Result } from './check-parser/package-files/result'
import { Workspace } from './check-parser/package-files/workspace'
import { Runtime } from '../runtimes'

const debug = Debug('checkly:cli:services:project-parser')

type ProjectParseOpts = {
  directory: string
  projectLogicalId: string
  projectName: string
  repoUrl?: string
  checkMatch?: string | string[]
  checkFilter?: CheckFilter
  includeTestOnlyChecks?: boolean
  browserCheckMatch?: string | string[]
  multiStepCheckMatch?: string | string[]
  ignoreDirectoriesMatch?: string[]
  checkDefaults?: CheckConfigDefaults
  browserCheckDefaults?: CheckConfigDefaults
  availableRuntimes: Record<string, Runtime>
  defaultRuntimeId: string
  verifyRuntimeDependencies?: boolean
  checklyConfigConstructs?: Construct[]
  playwrightConfigPath?: string
  include?: string | string[]
  includeFlagProvided?: boolean
  playwrightChecks?: PlaywrightSlimmedProp[]
  currentCommand?: 'pw-test' | 'test' | 'deploy'
  enableWorkspaces?: boolean
}

const BASE_CHECK_DEFAULTS = {
}

async function findBasePath (
  packageManager: PackageManager,
  directory: string,
  { ignoreWorkspaces = false },
): Promise<{
  basePath: string
  contextPath: string
  workspace: Result<Workspace, Error>
}> {
  try {
    if (ignoreWorkspaces) {
      const nearestPackageJson = await detectNearestPackageJson(directory)

      const workspace = await fauxWorkspaceFromPackageJson(
        packageManager,
        nearestPackageJson,
      )

      return {
        basePath: workspace.root.path,
        contextPath: workspace.root.path,
        workspace: Ok(workspace),
      }
    }

    const workspace = await packageManager.lookupWorkspace(directory)

    // If we can't locate a real workspace, set up a faux workspace instead.
    // Makes usage easier since we can rely on a workspace being available.
    if (!workspace) {
      return await findBasePath(packageManager, directory, {
        ignoreWorkspaces: true,
      })
    }

    // We've found a workspace. Let's try to figure out whether we're a part
    // of it.
    const nearestPackageJson = await detectNearestPackageJson(directory, {
      root: workspace.root.path,
    })

    const contextPath = nearestPackageJson.basePath

    // If the nearest workspace includes the nearest package, then use the
    // workspace root as the project root.
    if (workspace.memberByPath(contextPath) !== undefined) {
      return {
        basePath: workspace.root.path,
        contextPath,
        workspace: Ok(workspace),
      }
    }

    // Otherwise, use the config dir as the project root.
    return await findBasePath(packageManager, directory, {
      ignoreWorkspaces: true,
    })
  } catch (err) {
    if (err instanceof NoPackageJsonFoundError) {
      return {
        basePath: directory,
        contextPath: directory,
        workspace: Err(err),
      }
    }

    throw err
  }
}

export async function parseProject (opts: ProjectParseOpts): Promise<Project> {
  const {
    directory,
    checkMatch = '**/*.check.{js,ts}',
    checkFilter,
    includeTestOnlyChecks = false,
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
    playwrightConfigPath,
    include,
    includeFlagProvided,
    playwrightChecks,
    currentCommand,
    enableWorkspaces = true,
  } = opts

  // Clear sanitized logicalIds at the start of parsing
  Session.clearSanitizedLogicalIds()

  const project = new Project(projectLogicalId, {
    name: projectName,
    repoUrl,
  })

  if (includeTestOnlyChecks) {
    project.allowTestOnly(true)
  }

  const packageManager = await detectPackageManager(directory)
  debug(`Detected package manager ${packageManager.name}`)

  const { basePath, contextPath, workspace } = await findBasePath(packageManager, directory, {
    ignoreWorkspaces: !enableWorkspaces,
  })

  checklyConfigConstructs?.forEach(
    construct => project.addResource(construct.type, construct.logicalId, construct),
  )
  Session.project = project
  Session.basePath = basePath
  Session.contextPath = contextPath
  Session.checkDefaults = Object.assign({}, BASE_CHECK_DEFAULTS, checkDefaults)
  Session.checkFilter = checkFilter
  Session.browserCheckDefaults = browserCheckDefaults
  Session.availableRuntimes = availableRuntimes
  Session.defaultRuntimeId = defaultRuntimeId
  Session.verifyRuntimeDependencies = verifyRuntimeDependencies ?? true
  Session.ignoreDirectoriesMatch = ignoreDirectoriesMatch
  Session.currentCommand = currentCommand
  Session.includeFlagProvided = includeFlagProvided
  Session.packageManager = packageManager
  Session.workspace = workspace

  // TODO: Do we really need all of the ** globs, or could we just put node_modules?
  const ignoreDirectories = ['**/node_modules/**', '**/.git/**', ...ignoreDirectoriesMatch]

  await loadAllCheckFiles(directory, checkMatch, ignoreDirectories)

  // Load sequentially because otherwise Session.checkFileAbsolutePath and
  // Session.checkFilePath are going to be subject to race conditions.
  await loadAllBrowserChecks(directory, browserCheckMatch, ignoreDirectories, project)
  await loadAllMultiStepChecks(directory, multiStepCheckMatch, ignoreDirectories, project)
  await loadPlaywrightChecks(directory, playwrightChecks, playwrightConfigPath, include)

  // private-location must be processed after all checks and groups are loaded.
  await loadAllPrivateLocationsSlugNames(project)

  return project
}

function setCheckFilePaths (checkFile: string, directory: string): string {
  const relPath = pathToPosix(path.relative(directory, checkFile))

  Session.checkFileAbsolutePath = checkFile
  Session.checkFilePath = relPath

  return relPath
}

function resetCheckFilePaths () {
  Session.checkFilePath = undefined
  Session.checkFileAbsolutePath = undefined
}

// eslint-disable-next-line require-await
async function loadPlaywrightChecks (
  directory: string,
  playwrightChecks?: PlaywrightSlimmedProp[],
  playwrightConfigPath?: string,
  include?: string | string[],
) {
  if (playwrightChecks?.length) {
    try {
      for (const playwrightCheckProps of playwrightChecks) {
        const configPath = getPlaywrightConfigPath(playwrightCheckProps, playwrightConfigPath, directory)
        setCheckFilePaths(configPath, directory)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const playwrightCheck = new PlaywrightCheck(playwrightCheckProps.logicalId, {
          ...playwrightCheckProps,
          playwrightConfigPath: configPath,
          include,
        })
      }
    } finally {
      resetCheckFilePaths()
    }
  } else {
    try {
      if (!playwrightConfigPath) {
        return
      }
      setCheckFilePaths(playwrightConfigPath, directory)
      const resolvedPlaywrightConfigPath = path.resolve(directory, playwrightConfigPath)
      const basePath = path.basename(resolvedPlaywrightConfigPath)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const playwrightCheck = new PlaywrightCheck(basePath, {
        name: basePath,
        playwrightConfigPath: resolvedPlaywrightConfigPath,
        include,
      })
    } finally {
      resetCheckFilePaths()
    }
  }
}

async function loadAllCheckFiles (
  directory: string,
  checkFilePattern: string | string[],
  ignorePattern: string[],
): Promise<void> {
  const checkFiles = await findFilesWithPattern(directory, checkFilePattern, ignorePattern)
  for (const checkFile of checkFiles) {
    try {
      setCheckFilePaths(checkFile, directory)
      await Session.loadFile(checkFile)
    } finally {
      resetCheckFilePaths()
    }
  }
}

function getExistingEntrypoints (project: Project): Set<string> {
  const files = new Set<string>()

  Object.values(project.data.check).forEach(check => {
    if (check instanceof BrowserCheck && isEntrypoint(check.code)) {
      const absoluteEntrypoint = check.resolveContentFilePath(check.code.entrypoint)
      const relativeEntrypoint = Session.relativePosixPath(absoluteEntrypoint)
      files.add(relativeEntrypoint)
      return
    }

    if (check instanceof MultiStepCheck && isEntrypoint(check.code)) {
      const absoluteEntrypoint = check.resolveContentFilePath(check.code.entrypoint)
      const relativeEntrypoint = Session.relativePosixPath(absoluteEntrypoint)
      files.add(relativeEntrypoint)
      return
    }
  })

  return files
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
  const preexistingCheckFiles = getExistingEntrypoints(project)

  for (const checkFile of checkFiles) {
    try {
      const relPath = setCheckFilePaths(checkFile, directory)
      // Don't create an additional check if the checkFile was already added
      // to a check in loadAllCheckFiles.
      if (preexistingCheckFiles.has(relPath)) {
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const browserCheck = new BrowserCheck(pathToPosix(relPath), {
        name: path.basename(checkFile),
        code: {
          entrypoint: checkFile,
        },
      })
    } finally {
      resetCheckFilePaths()
    }
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
  const preexistingCheckFiles = getExistingEntrypoints(project)

  for (const checkFile of checkFiles) {
    try {
      const relPath = setCheckFilePaths(checkFile, directory)
      // Don't create an additional check if the checkFile was already added
      // to a check in loadAllCheckFiles.
      if (preexistingCheckFiles.has(relPath)) {
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const multistepCheck = new MultiStepCheck(pathToPosix(relPath), {
        name: path.basename(checkFile),
        code: {
          entrypoint: checkFile,
        },
      })
    } finally {
      resetCheckFilePaths()
    }
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
  const resourcesWithSlugNames: Array<Check | CheckGroup> =
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
