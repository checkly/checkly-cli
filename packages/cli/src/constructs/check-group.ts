import * as path from 'path'
import * as glob from 'glob'
import { Ref } from './ref'
import { Session } from './project'
import { Construct } from './construct'
import { BrowserCheck } from './browser-check'
import { AlertChannel } from './alert-channel'
import { EnvironmentVariable } from './environment-variable'
import { AlertChannelSubscription } from './alert-channel-subscription'
import { CheckConfigDefaults } from '../services/checkly-config-loader'

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

type BrowserCheckConfig = CheckConfigDefaults & {
  /**
   * Glob pattern to include multiple files, i.e. all `.spec.js` files
   */
  testMatch: string,
}

export interface CheckGroupProps {
  /**
   * The name of the check group.
   */
  name: string
  /**
   * Determines if the checks in the group are running or not.
   */
  activated: boolean
  /**
   * Determines if any notifications will be send out when a check in this group fails and/or recovers.
   */
  muted: boolean
  /**
   * The runtime version, i.e. fixed set of runtime dependencies, used to execute checks in this group.
   */
  runtimeId: string
  /**
   * An array of one or more data center locations where to run the checks.
   */
  locations: Array<string>
  /**
   * An array of one or more private locations where to run the checks.
   */
  privateLocations?: Array<string>
  /**
   * Tags for organizing and filtering checks.
   */
  tags: Array<string>
  /**
   * Determines how many checks are invoked concurrently when triggering a check group from CI/CD or through the API.
   */
  concurrency: number
  environmentVariables: Array<EnvironmentVariable>
  /**
   * List of alert channel subscriptions.
   */
  alertChannels?: Array<AlertChannel>
  browserChecks?: BrowserCheckConfig,
  /**
   * A valid piece of Node.js code to run in the setup phase of an API check in this group.
   */
  localSetupScript?: string
  /**
   * A valid piece of Node.js code to run in the teardown phase of an API check in this group.
   */
  localTearDownScript?: string
  apiCheckDefaults: any
  browserCheckDefaults: any
}

/**
 * Creates a Check Group
 *
 * @remarks
 *
 * This class make use of the Check Groups endpoints.
 */
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
    this.browserCheckDefaults = props.browserCheckDefaults ?? {}
    this.environmentVariables = props.environmentVariables ?? []
    this.alertChannels = props.alertChannels ?? []
    const fileAbsolutePath = Session.checkFileAbsolutePath!
    if (props.browserChecks?.testMatch) {
      this.__addChecks(fileAbsolutePath, props.browserChecks)
    }
    this.register(CheckGroup.__checklyType, this.logicalId, this.synthesize())
    this.__addSubscriptions()
  }

  private __addChecks (fileAbsolutePath: string, browserChecks: BrowserCheckConfig) {
    const parent = path.dirname(fileAbsolutePath)
    const matched = glob.sync(browserChecks.testMatch, { nodir: true, cwd: parent })
    for (const match of matched) {
      const defaults: CheckConfigDefaults = {}
      let configKey: keyof CheckConfigDefaults
      for (configKey in browserChecks as CheckConfigDefaults) {
        const newVal: any = browserChecks[configKey]
        defaults[configKey] = newVal
      }
      const filepath = path.join(parent, match)
      const props = {
        groupId: this.ref(),
        name: match,
        ...defaults,
        code: {
          entrypoint: filepath,
        },
      }
      const checkLogicalId = path.relative(Session.basePath!, filepath)
      const check = new BrowserCheck(checkLogicalId, props)
    }
  }

  private __addSubscriptions () {
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
