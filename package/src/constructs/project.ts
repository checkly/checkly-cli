import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { Construct } from './construct'
import { ValidationError } from './validator-error'

import type { Runtime } from '../rest/runtimes'

export interface ProjectProps {
  /**
   * Friendly name for your project.
   */
  name: string
  /**
   * Git repository URL.
   */
  repoUrl: string
}

export class Project {
  name: string
  repoUrl: string
  logicalId: string
  data: Record<string, Record<string, any>> = {
    checks: {},
    groups: {},
    alertChannels: {},
    alertChannelSubscriptions: {},
  }

  /**
   * Constructs the Email Alert Channel instance
   *
   * @param logicalId unique project name
   * @param props project configuration properties
   */
  constructor (logicalId: string, props: ProjectProps) {
    if (!props.name) {
      // TODO: Can we collect a list of validation errors and return them all at once? This might be better UX.
      throw new ValidationError('The project must have a name specified')
    }

    this.name = props.name
    this.repoUrl = props.repoUrl
    this.logicalId = logicalId
  }

  addResource (type: string, logicalId: string, resource: any) {
    this.data[type][logicalId] = resource
  }

  synthesize () {
    const project = {
      logicalId: this.logicalId,
      name: this.name,
      repoUrl: this.repoUrl,
    }
    return {
      project,
      checks: this.data.checks,
      groups: this.data.groups,
      alertChannels: this.data.alertChannels,
      alertChannelSubscriptions: this.data.alertChannelSubscriptions,
    }
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
  static checklyConfigConstructs?: Array<Construct>

  static registerConstruct (construct: Construct) {
    if (Session.project) {
      Session.project.addResource(construct.type, construct.logicalId, construct.synthesize())
    } else if (Session.checklyConfigConstructs) {
      Session.checklyConfigConstructs.push(construct)
    } else {
      throw new Error('Internal Error: Session is not properly configured for using a construct. Please contact Checkly support.')
    }
  }
}
