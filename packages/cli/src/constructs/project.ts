import path from 'node:path'

import * as api from '../rest/api'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { Parser } from '../services/check-parser/parser'
import { Construct } from './construct'
import { ValidationError } from './validator-error'

import type { Runtime } from '../rest/runtimes'
import {
  Check, AlertChannelSubscription, AlertChannel, CheckGroup, MaintenanceWindow, Dashboard,
  PrivateLocation, HeartbeatMonitor, PrivateLocationCheckAssignment, PrivateLocationGroupAssignment,
  StatusPage, StatusPageService,
} from './'
import { PrivateLocationApi } from '../rest/private-locations'
import {
  FileLoader,
  JitiFileLoader,
  MixedFileLoader,
  NativeFileLoader,
  TSNodeFileLoader,
} from '../loader'
import { Diagnostics } from './diagnostics'
import { ConstructDiagnostics, InvalidPropertyValueDiagnostic } from './construct-diagnostics'
import { ProjectBundle, ProjectDataBundle } from './project-bundle'
import { pathToPosix } from '../services/util'

export interface ProjectProps {
  /**
   * Friendly name for your project.
   */
  name: string
  /**
   * Git repository URL.
   */
  repoUrl?: string
}

export type Resources = {
  check: Check
  'check-group': CheckGroup
  'alert-channel': AlertChannel
  'alert-channel-subscription': AlertChannelSubscription
  'maintenance-window': MaintenanceWindow
  'private-location': PrivateLocation
  'private-location-check-assignment': PrivateLocationCheckAssignment
  'private-location-group-assignment': PrivateLocationGroupAssignment
  dashboard: Dashboard
  'status-page': StatusPage
  'status-page-service': StatusPageService
}

export type ProjectData = {
  [x in keyof Resources]: Record<string, Resources[x]>
}

export class Project extends Construct {
  name: string
  repoUrl?: string
  logicalId: string
  testOnlyAllowed = false
  data: ProjectData = {
    check: {},
    'check-group': {},
    'alert-channel': {},
    'alert-channel-subscription': {},
    'maintenance-window': {},
    'private-location': {},
    'private-location-check-assignment': {},
    'private-location-group-assignment': {},
    dashboard: {},
    'status-page': {},
    'status-page-service': {},
  }

  static readonly __checklyType = 'project'

  /**
   * Constructs the Project instance
   *
   * @param logicalId unique project identifier
   * @param props project configuration properties
   */
  constructor (logicalId: string, props: ProjectProps) {
    super(Project.__checklyType, logicalId)
    this.name = props.name
    this.repoUrl = props.repoUrl
    this.logicalId = logicalId
  }

  describe (): string {
    return `Project:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    if (!this.name) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'name',
        new Error(`Value must not be empty.`),
      ))
    }

    const data: Record<keyof ProjectData, Record<string, Construct>> = this.data

    const constructDiagnostics = await Promise.all(
      Object.entries(data).flatMap(([, records]) => {
        return Object.values(records).map(async construct => {
          const diagnostics = new ConstructDiagnostics(construct)
          await construct.validate(diagnostics)
          return diagnostics
        })
      })
    )

    diagnostics.extend(...constructDiagnostics)
  }

  allowTestOnly (enabled: boolean) {
    this.testOnlyAllowed = enabled
  }

  addResource (type: string, logicalId: string, resource: Construct) {
    const existingResource = this.data[type as keyof ProjectData][logicalId]
    if (existingResource) {
      // Non-member resources (i.e. references) can be used multiple times.
      // Behind the scenes, we'll create a single mapping for them, and the
      // referenced resource isn't managed by the project at all.
      if (!resource.member && !existingResource.member && existingResource.physicalId === resource.physicalId) {
        return
      }

      throw new Error(`Resource of type '${type}' with logical id '${logicalId}' already exists.`)
    }

    this.data[type as keyof ProjectData][logicalId] = resource
  }

  async bundle (): Promise<ProjectBundle> {
    const data: Record<keyof ProjectData, Record<string, Construct>> = {
      ...this.data,

      // Filter out testOnly checks before bundling.
      check: Object.fromEntries(
        Object.entries(this.data.check)
          .filter(([, check]) => !check.testOnly || this.testOnlyAllowed)
          .filter(([, check]) => Session.checkFilter?.(check) ?? true),
      ),
    }

    const constructBundles = await Promise.all(
      Object.entries(data).flatMap(([, records]) => {
        return Object.entries(records).map(async ([, construct]) => {
          const bundle = await construct.bundle()
          return {
            construct,
            bundle,
          }
        })
      })
    )

    const dataBundle = Object.fromEntries(
      Object.entries(data).map(([type]) => {
        return [type, {}]
      }),
    ) as ProjectDataBundle

    for (const constructBundle of constructBundles) {
      const { construct: { type, logicalId } } = constructBundle 
      dataBundle[type as keyof ProjectDataBundle][logicalId] = constructBundle
    }

    return new ProjectBundle(this, dataBundle)
  }

  synthesize () {
    const project = {
      logicalId: this.logicalId,
      name: this.name,
      repoUrl: this.repoUrl,
    }
    return {
      project,
      sharedFiles: Session.sharedFiles,
    }
  }

  getTestOnlyConstructs (): Construct[] {
    return Object
      .values(this.data)
      .flatMap((record: Record<string, Construct>) =>
        Object
          .values(record)
          .filter((construct: Construct) => construct instanceof Check && construct.testOnly))
  }

  getHeartbeatLogicalIds (): string[] {
    return Object
      .values(this.data.check)
      .filter((construct: Construct) => construct instanceof HeartbeatMonitor)
      .map((construct: Check) => construct.logicalId)
  }
}

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
    new TSNodeFileLoader(),
  )
  static project?: Project
  static basePath?: string
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
  static constructExports: ConstructExport[] = []

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
      throw new Error(`Error loading file '${filePath}'\n${err.stack}`)
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
    if (typeof construct.logicalId !== 'string') {
      throw new ValidationError(`The "logicalId" of a construct must be a string (logicalId=${construct.logicalId} [${typeof construct.logicalId}])`)
    }

    if (!/^[A-Za-z0-9_\-/#.]+$/.test(construct.logicalId)) {
      throw new ValidationError(`The "logicalId" can only include the following characters: [A-Za-z0-9_-/#.]. (logicalId='${construct.logicalId}')`)
    }

    if (construct.type === Project.__checklyType) {
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

  static getParser (runtime: Runtime): Parser {
    const cachedParser = Session.parsers.get(runtime.name)
    if (cachedParser !== undefined) {
      return cachedParser
    }

    const parser = new Parser({
      supportedNpmModules: Object.keys(runtime.dependencies),
      checkUnsupportedModules: Session.verifyRuntimeDependencies,
    })

    Session.parsers.set(runtime.name, parser)

    return parser
  }

  static relativePosixPath (filePath: string): string {
    return pathToPosix(path.relative(Session.basePath!, filePath))
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
