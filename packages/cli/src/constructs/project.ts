import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { Construct } from './construct'
import { ValidationError } from './validator-error'

import type { Runtime } from '../rest/runtimes'
import { Check } from './check'
import { CheckGroup } from './check-group'
import { AlertChannel } from './alert-channel'
import { AlertChannelSubscription } from './alert-channel-subscription'

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

interface ProjectData {
  checks: Record<string, Check>,
  groups: Record<string, CheckGroup>,
  alertChannels: Record<string, AlertChannel>,
  alertChannelSubscriptions: Record<string, AlertChannelSubscription>,
}

export class Project extends Construct {
  name: string
  repoUrl?: string
  logicalId: string
  data: ProjectData = {
    checks: {},
    groups: {},
    alertChannels: {},
    alertChannelSubscriptions: {},
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
      throw new ValidationError('The project must have a name specified')
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
    checks: Record<string, Check>
    groups: Record<string, CheckGroup>
    alertChannels: Record<string, AlertChannel>
    alertChannelSubscriptions: Record<string, AlertChannelSubscription>
  } {
    const project = {
      logicalId: this.logicalId,
      name: this.name,
      repoUrl: this.repoUrl,
    }
    return {
      project,
      checks: this.synthesizeRecord(this.data.checks, addTestOnly),
      groups: this.synthesizeRecord(this.data.groups),
      alertChannels: this.synthesizeRecord(this.data.alertChannels),
      alertChannelSubscriptions: this.synthesizeRecord(this.data.alertChannelSubscriptions),
    }
  }

  private synthesizeRecord (record: Record<string, Check|CheckGroup|AlertChannel|AlertChannelSubscription>,
    addTestOnly = true) {
    const synthesizedConstructs = Object.entries(record)
      .filter(([, construct]) => construct instanceof Check ? !construct.testOnly || addTestOnly : true)
      .map(([key, construct]) => [key, construct.synthesize()])
    return Object.fromEntries(synthesizedConstructs)
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
      throw new Error('Internal Error: Session is not properly configured for using a construct. Please contact Checkly support.')
    }
  }

  static validateCreateConstruct (construct: Construct) {
    if (!/^[A-Za-z0-9_\-/#.]+$/.test(construct.logicalId)) {
      throw new ValidationError(`The 'logicalId' must includes only allowed characters [A-Za-z0-9_-/#.]. (logicalId='${construct.logicalId}')`)
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
