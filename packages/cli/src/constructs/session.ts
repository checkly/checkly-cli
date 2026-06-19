import path from 'node:path'

import * as api from '../rest/api.js'
import { CheckConfigDefaults } from '../services/checkly-config-loader.js'
import { type EngineDetectionResult } from '../services/engine-detector.js'
import { Parser } from '../services/check-parser/parser.js'
import { Construct } from './construct.js'
import { PrivateLocationApi } from '../rest/private-locations.js'
import {
  FileLoader,
  JitiFileLoader,
  MixedFileLoader,
  NativeFileLoader,
  UnsupportedFileLoaderError,
} from '../loader/index.js'
import { pathToPosix } from '../services/util.js'
import { Workspace } from '../services/check-parser/package-files/workspace.js'
import { npmPackageManager, PackageManager } from '../services/check-parser/package-files/package-manager.js'
import { Err, Result } from '../services/check-parser/package-files/result.js'
import { Runtime } from '../runtimes/index.js'
import { PlaywrightProjectBundler } from '../services/playwright-project-bundler.js'
import { PROJECT_CONSTRUCT_TYPE } from '../constants.js'

// Construct classes are imported as TYPES ONLY. Session lives in its own module
// (rather than in project.js) precisely so that the construct base classes can
// import it without pulling in `project.js`, which re-exports every construct
// through the barrel and forms an import cycle. A value import of a construct
// here would re-introduce that cycle (and the "Class extends value undefined"
// initialisation failures it causes under bundlers such as Vite/vitest).
import type { Project } from './project.js'
import type { Check } from './check.js'

export interface ConstructExport {
  type: string
  logicalId: string
  filePath: string
  exportName: string
}

export type CheckFilter = (check: Check) => boolean

export interface SharedFile {
  path: string
  content: string
}

export type SharedFileRef = number

export class Session {
  static loader: FileLoader = new MixedFileLoader(
    new NativeFileLoader(),
    new JitiFileLoader(),
  )

  static project?: Project
  static basePath?: string
  static contextPath?: string
  static checkDefaults?: CheckConfigDefaults
  static checkFilter?: CheckFilter
  static browserCheckDefaults?: CheckConfigDefaults
  static multiStepCheckDefaults?: CheckConfigDefaults
  static checkFilePath?: string
  static checkFileAbsolutePath?: string
  static availableRuntimes: Record<string, Runtime>
  static defaultRuntimeId?: string
  static verifyRuntimeDependencies = true
  static loadingChecklyConfigFile: boolean
  static checklyConfigFileConstructs?: Construct[]
  static privateLocations: PrivateLocationApi[]
  static parsers = new Map<string, Parser>()
  static playwrightProjectBundler?: PlaywrightProjectBundler
  static constructExports: ConstructExport[] = []
  static ignoreDirectoriesMatch: string[] = []
  static warnOnWebServerConfig?: boolean
  static packageManager: PackageManager = npmPackageManager
  static workspace: Result<Workspace, Error> = Err(new Error(`Workspace support not initialized`))
  static detectedEnginePromise?: Promise<EngineDetectionResult | null>

  static reset () {
    this.project = undefined
    this.basePath = undefined
    this.contextPath = undefined
    this.checkDefaults = undefined
    this.checkFilter = undefined
    this.browserCheckDefaults = undefined
    this.multiStepCheckDefaults = undefined
    this.checkFilePath = undefined
    this.checkFileAbsolutePath = undefined
    this.availableRuntimes = {}
    this.defaultRuntimeId = undefined
    this.verifyRuntimeDependencies = true
    this.loadingChecklyConfigFile = false
    this.checklyConfigFileConstructs = undefined
    this.privateLocations = []
    this.parsers = new Map<string, Parser>()
    this.playwrightProjectBundler = undefined
    this.constructExports = []
    this.ignoreDirectoriesMatch = []
    this.warnOnWebServerConfig = false
    this.packageManager = npmPackageManager
    this.workspace = Err(new Error(`Workspace support not initialized`))
    this.detectedEnginePromise = undefined
    this.resetSharedFiles()
  }

  static async loadFile<T = unknown> (filePath: string): Promise<T> {
    const loader = this.loader
    if (loader === undefined) {
      throw new Error(`Session has no loader set`)
    }

    if (!loader.isAuthoritativeFor(filePath)) {
      throw new Error(`Unable to find a compatible loader for file '${filePath}'`)
    }

    try {
      const moduleExports = await loader.loadFile<Record<string, any>>(filePath)

      // Register all exported constructs we find.
      for (const [exportName, value] of Object.entries(moduleExports ?? {})) {
        if (value instanceof Construct) {
          this.constructExports.push({
            type: value.type,
            logicalId: value.logicalId,
            filePath,
            exportName,
          })
        }
      }

      const defaultExport = moduleExports?.default ?? moduleExports
      if (typeof defaultExport === 'function') {
        return await defaultExport()
      }

      return defaultExport
    } catch (err: any) {
      if (err instanceof UnsupportedFileLoaderError && /\.[cm]?ts$/.test(filePath)) {
        throw new Error(
          `Unable to load the TypeScript file '${filePath}'.`,
          { cause: err },
        )
      }

      throw new Error(`Error loading file '${filePath}'\n${err.stack}`, { cause: err })
    }
  }

  static registerConstruct (construct: Construct) {
    if (Session.project) {
      Session.project.addResource(construct.type, construct.logicalId, construct)
    } else if (Session.loadingChecklyConfigFile && construct.allowInChecklyConfig()) {
      Session.checklyConfigFileConstructs!.push(construct)
    } else {
      throw new Error('Internal Error: Session is not properly configured for using a construct. Please contact Checkly support at support@checklyhq.com.')
    }
  }

  static validateCreateConstruct (construct: Construct) {
    if (construct.type === PROJECT_CONSTRUCT_TYPE) {
      // Creating the construct is allowed - We're creating the project.
    } else if (Session.project) {
      // Creating the construct is allowed - We're in the process of parsing the project.
    } else if (Session.loadingChecklyConfigFile && construct.allowInChecklyConfig()) {
      // Creating the construct is allowed - We're in the process of parsing the Checkly config.
    } else if (Session.loadingChecklyConfigFile) {
      throw new Error(`Creating a ${construct.constructor.name} construct in the Checkly config file isn't supported.`)
    } else {
      throw new Error(`Unable to create a construct '${construct.constructor.name}' outside a Checkly CLI project.`)
    }
  }

  static async getPrivateLocations () {
    if (!Session.privateLocations) {
      const { data: privateLocations } = await api.privateLocations.getAll()
      Session.privateLocations = privateLocations
    }
    return Session.privateLocations
  }

  static getRuntime (runtimeId?: string): Runtime | undefined {
    const effectiveRuntimeId = runtimeId ?? Session.defaultRuntimeId
    if (effectiveRuntimeId === undefined) {
      throw new Error('Internal Error: Account default runtime is not set. Please contact Checkly support at support@checklyhq.com.')
    }
    return Session.availableRuntimes[effectiveRuntimeId]
  }

  static #getOrInitParser (cacheKey: string, init: () => Parser) {
    const existingParser = Session.parsers.get(cacheKey)
    if (existingParser !== undefined) {
      return existingParser
    }

    const newParser = init()

    Session.parsers.set(cacheKey, newParser)

    return newParser
  }

  static getParser (runtime: Runtime): Parser {
    return this.#getOrInitParser(`runtime:${runtime.name}`, () => {
      return new Parser({
        supportedNpmModules: Object.keys(runtime.dependencies),
        checkUnsupportedModules: Session.verifyRuntimeDependencies,
        workspace: Session.workspace.ok(),
      })
    })
  }

  static getPlaywrightParser (): Parser {
    return this.#getOrInitParser(`playwright`, () => {
      return new Parser({
        checkUnsupportedModules: false,
        workspace: Session.workspace.ok(),
        restricted: false,
      })
    })
  }

  static getPlaywrightProjectBundler (): PlaywrightProjectBundler {
    if (this.playwrightProjectBundler === undefined) {
      this.playwrightProjectBundler = new PlaywrightProjectBundler()
    }
    return this.playwrightProjectBundler
  }

  static relativePosixPath (filePath: string): string {
    return pathToPosix(path.relative(Session.basePath!, filePath))
  }

  static contextRelativePosixPath (filePath: string): string {
    return pathToPosix(path.relative(Session.contextPath!, filePath))
  }

  static sharedFileRefs = new Map<string, SharedFileRef>()
  static sharedFiles: SharedFile[] = []

  static registerSharedFile (file: SharedFile): SharedFileRef {
    const ref = Session.sharedFileRefs.get(file.path)
    if (ref !== undefined) {
      return ref
    }
    const newRef = Session.sharedFiles.push(file) - 1
    Session.sharedFileRefs.set(file.path, newRef)
    return newRef
  }

  static resetSharedFiles (): void {
    Session.sharedFileRefs.clear()
    Session.sharedFiles.splice(0)
  }
}
