import * as glob from 'glob'
import { Ref } from './ref'
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
    tags: Array<string>
    concurrency: number
    environmentVariables: Array<EnvironmentVariable>
    alertChannels?: Array<AlertChannel>
    pattern?: string
    apiCheckDefaults: any
    browserCheckDefaults: any
  }

export class CheckGroup extends Construct {
  name: string
  activated: boolean
  muted: boolean
  runtimeId: string
  locations: Array<string>
  tags: Array<string>
  concurrency: number
  environmentVariables: Array<EnvironmentVariable>
  alertChannels?: Array<AlertChannel>
  // TODO add types later on
  apiCheckDefaults: any
  browserCheckDefaults: any

  static readonly __checklyType = 'groups'

  constructor (logicalId: string, props: CheckGroupProps) {
    super(logicalId)
    this.name = props.name
    this.activated = props.activated
    this.muted = props.muted
    this.tags = props.tags
    this.runtimeId = props.runtimeId
    this.locations = props.locations
    this.concurrency = props.concurrency
    this.apiCheckDefaults = props.apiCheckDefaults || defaultApiCheckDefaults
    this.browserCheckDefaults = props.browserCheckDefaults || {}
    this.environmentVariables = props.environmentVariables
    this.alertChannels = props.alertChannels ?? []
    if (props.pattern) {
      const matched = glob.sync(props.pattern, { nodir: true })
      for (const match of matched) {
        const check = new BrowserCheck(match, {
          groupId: new Ref(this.logicalId),
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
    this.register(CheckGroup.__checklyType, this.logicalId, this.synthesize())
    this.addSubscriptions()
  }

  addSubscriptions () {
    if (!this.alertChannels) {
      return
    }
    for (const alertChannel of this.alertChannels) {
      const subscription = new AlertChannelSubscription(`check-group-alert-channel-subscription#${this.logicalId}#${alertChannel.logicalId}`, {
        alertChannelId: { ref: alertChannel.logicalId },
        groupId: { ref: this.logicalId },
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
      concurrency: this.concurrency,
      apiCheckDefaults: this.apiCheckDefaults,
      browserCheckDefaults: this.browserCheckDefaults,
      environmentVariables: this.environmentVariables,
    }
  }
}
