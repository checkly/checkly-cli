import * as glob from 'glob'
import { Ref } from './ref'
import { Session } from './project'
import { Construct } from './construct'
import { BrowserCheck } from './browser-check'
import { AlertChannel } from './alert-channel'
import { EnvironmentVariable } from './environment-variable'
import { AlertChannelSubscription } from './alert-channel-subscription'
import path = require('path')

// TODO: turn this into type
const defaultApiCheckDefaults = {
  headers: [],
  queryParameters: [],
  url: '',
  basicAuth: {
    username: '',
    password: '',
  },
}

export interface CheckGroupProps {
    name: string
    activated: boolean
    muted: boolean
    runtimeId: string
    locations: Array<string>
    privateLocations?: Array<string>
    tags: Array<string>
    concurrency: number
    environmentVariables: Array<EnvironmentVariable>
    alertChannels?: Array<AlertChannel>
    pattern?: string
    localSetupScript?: string
    localTearDownScript?: string
    apiCheckDefaults: any
    browserCheckDefaults: any
  }

export class CheckGroup extends Construct {
  name: string
  activated: boolean
  muted: boolean
  runtimeId: string
  locations: Array<string>
  privateLocations?: Array<string>
  tags: Array<string>
  concurrency: number
  environmentVariables: Array<EnvironmentVariable>
  alertChannels?: Array<AlertChannel>
  localSetupScript?: string
  localTearDownScript?: string
  // TODO add types later on
  apiCheckDefaults: any
  browserCheckDefaults: any
  __checkFilePath: string // internal variable to filter by check file name from the CLI

  static readonly __checklyType = 'groups'

  constructor (logicalId: string, props: CheckGroupProps) {
    super(logicalId)
    this.name = props.name
    this.activated = props.activated
    this.muted = props.muted
    this.tags = props.tags
    this.runtimeId = props.runtimeId
    this.locations = props.locations
    this.privateLocations = props.privateLocations
    this.concurrency = props.concurrency
    this.apiCheckDefaults = props.apiCheckDefaults || defaultApiCheckDefaults
    this.browserCheckDefaults = props.browserCheckDefaults || {}
    this.environmentVariables = props.environmentVariables
    this.alertChannels = props.alertChannels ?? []
    this.__checkFilePath = Session.checkFilePath!
    if (props.pattern) {
      this.addChecks(props.pattern)
    }
    this.register(CheckGroup.__checklyType, this.logicalId, this.synthesize())
    this.addSubscriptions()
  }

  addChecks (pattern: string) {
    const matched = glob.sync(pattern, { nodir: true, cwd: path.dirname(this.__checkFilePath) })
    for (const match of matched) {
      const check = new BrowserCheck(match, {
        groupId: Ref.from(this.logicalId),
        name: match,
        activated: true,
        muted: false,
        locations: this.locations,
        code: {
          // TODO: We need to make this relative to the previous caller in the stack
          entrypoint: path.join(process.cwd(), match),
        },
      })
    }
  }

  addSubscriptions () {
    if (!this.alertChannels) {
      return
    }
    for (const alertChannel of this.alertChannels) {
      const subscription = new AlertChannelSubscription(`check-group-alert-channel-subscription#${this.logicalId}#${alertChannel.logicalId}`, {
        alertChannelId: Ref.from(alertChannel.logicalId),
        groupId: Ref.from(this.logicalId),
        activated: true,
      })
    }
  }

  synthesize () {
    return {
      name: this.name,
      activated: this.activated,
      muted: this.muted,
      tags: this.tags,
      locations: this.locations,
      privateLocations: this.privateLocations,
      concurrency: this.concurrency,
      localSetupScript: this.localSetupScript,
      localTearDownScript: this.localTearDownScript,
      apiCheckDefaults: this.apiCheckDefaults,
      browserCheckDefaults: this.browserCheckDefaults,
      environmentVariables: this.environmentVariables,
    }
  }
}
