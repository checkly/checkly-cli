import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { Construct } from './construct'
import { ValidationError } from './validator-error'

import type { Runtime } from '../rest/runtimes'
import { Check } from './check'
import { CheckGroup } from './check-group'
import { AlertChannel } from './alert-channel'
import { AlertChannelSubscription } from './alert-channel-subscription'
import { PrivateLocation } from './private-location'
import { ResourceSync } from '../rest/projects'

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
  'private-location': Record<string, PrivateLocation>,
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
    'private-location': {},
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
        ...this.synthesizeRecord(this.data['private-location']),
      ],
    }
  }

  private synthesizeRecord (record: Record<string,
    Check|CheckGroup|AlertChannel|AlertChannelSubscription|PrivateLocation>, addTestOnly = true) {
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
  static checkFilePath?: string
  static checkFileAbsolutePath?: string
  static availableRuntimes: Record<string, Runtime>
  static loadingChecklyConfigFile: boolean
  static checklyConfigFileConstructs?: Construct[]

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
}
