import * as api from '../rest/api'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { Construct } from './construct'
import { ValidationError } from './validator-error'

import type { Runtime } from '../rest/runtimes'
import {
  Check, AlertChannelSubscription, AlertChannel, CheckGroup, MaintenanceWindow, Dashboard,
  PrivateLocation, HeartbeatCheck, PrivateLocationCheckAssignment, PrivateLocationGroupAssignment, Suites, Suite,
} from './'
import { ResourceSync } from '../rest/projects'
import { PrivateLocationApi } from '../rest/private-locations'

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

export interface ProjectData {
  check: Record<string, Check>,
  'check-group': Record<string, CheckGroup>,
  'alert-channel': Record<string, AlertChannel>,
  'alert-channel-subscription': Record<string, AlertChannelSubscription>,
  'maintenance-window': Record<string, MaintenanceWindow>,
  'private-location': Record<string, PrivateLocation>,
  'private-location-check-assignment': Record<string, PrivateLocationCheckAssignment>,
  'private-location-group-assignment': Record<string, PrivateLocationGroupAssignment>,
  dashboard: Record<string, Dashboard>,
  suites: Record<string, Suite>,
}

export class Project extends Construct {
  name: string
  repoUrl?: string
  logicalId: string
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
    suites: {},
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
    if (!props.name) {
      // TODO: Can we collect a list of validation errors and return them all at once? This might be better UX.
      throw new ValidationError('Please give your project a name in the "name" property.')
    }
    this.name = props.name
    this.repoUrl = props.repoUrl
    this.logicalId = logicalId
  }

  addResource (type: string, logicalId: string, resource: Construct) {
    if (this.data[type as keyof ProjectData][logicalId]) {
      throw new Error(`Resource of type '${type}' with logical id '${logicalId}' already exists.`)
    }
    this.data[type as keyof ProjectData][logicalId] = resource
  }

  synthesize (addTestOnly = true): {
    project: Pick<Project, 'logicalId' | 'name' | 'repoUrl'>,
    resources: Array<ResourceSync>
  } {
    const project = {
      logicalId: this.logicalId,
      name: this.name,
      repoUrl: this.repoUrl,
    }
    return {
      project,
      resources: [
        ...this.synthesizeRecord(this.data.check, addTestOnly),
        ...this.synthesizeRecord(this.data['check-group']),
        ...this.synthesizeRecord(this.data['alert-channel']),
        ...this.synthesizeRecord(this.data['alert-channel-subscription']),
        ...this.synthesizeRecord(this.data['maintenance-window']),
        ...this.synthesizeRecord(this.data['private-location']),
        ...this.synthesizeRecord(this.data['private-location-check-assignment']),
        ...this.synthesizeRecord(this.data['private-location-group-assignment']),
        ...this.synthesizeRecord(this.data.dashboard),
        // ...this.synthesizeRecord(this.data.suites),
      ],
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
      .filter((construct: Construct) => construct instanceof HeartbeatCheck)
      .map((construct: Check) => construct.logicalId)
  }

  private synthesizeRecord (record: Record<string,
    Check|CheckGroup|AlertChannel|AlertChannelSubscription|MaintenanceWindow|Dashboard|
    PrivateLocation|PrivateLocationCheckAssignment|PrivateLocationGroupAssignment>, addTestOnly = true) {
    return Object.entries(record)
      .filter(([, construct]) => construct instanceof Check ? !construct.testOnly || addTestOnly : true)
      .map(([key, construct]) => ({
        logicalId: key,
        type: construct.type,
        physicalId: construct.physicalId,
        member: construct.member,
        payload: construct.synthesize(),
      }))
  }
}

export class Session {
  static project?: Project
  static basePath?: string
  static checkDefaults?: CheckConfigDefaults
  static browserCheckDefaults?: CheckConfigDefaults
  static multiStepCheckDefaults?: CheckConfigDefaults
  static checkFilePath?: string
  static checkFileAbsolutePath?: string
  static availableRuntimes: Record<string, Runtime>
  static verifyRuntimeDependencies = true
  static loadingChecklyConfigFile: boolean
  static checklyConfigFileConstructs?: Construct[]
  static privateLocations: PrivateLocationApi[]

  static registerConstruct (construct: Construct) {
    if (Session.project) {
      Session.project.addResource(construct.type, construct.logicalId, construct)
    } else if (Session.loadingChecklyConfigFile && construct.allowInChecklyConfig()) {
      Session.checklyConfigFileConstructs!.push(construct)
    } else {
      throw new Error('Internal Error: Session is not properly configured for using a construct. Please contact Checkly support on support@checklyhq.com')
    }
  }

  static validateCreateConstruct (construct: Construct) {
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
}
