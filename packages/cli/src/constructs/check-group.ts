import * as path from 'path'
import { glob } from 'glob'
import { Ref } from './ref'
import { Session } from './project'
import { Construct } from './construct'
import { BrowserCheck } from './browser-check'
import { AlertChannel } from './alert-channel'
import { EnvironmentVariable } from './environment-variable'
import { AlertChannelSubscription } from './alert-channel-subscription'
import { PrivateLocation } from './private-location'
import { PrivateLocationGroupAssignment } from './private-location-group-assignment'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { ApiCheckDefaultConfig } from './api-check'
import { pathToPosix } from '../services/util'
import type { Region } from '..'
import { type Frequency } from './frequency'
import { type RetryStrategy } from './retry-strategy'
import { AlertEscalation } from './alert-escalation-policy'
import { MultiStepCheck } from './multi-step-check'
import CheckTypes from '../constants'

const defaultApiCheckDefaults: ApiCheckDefaultConfig = {
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
   * Glob pattern to include multiple files, i.e. all `.spec.ts` files
   */
  testMatch: string | string[],
}

type MultiStepCheckConfig = CheckConfigDefaults & {
  /**
   * Glob pattern to include multiple files, i.e. all `.spec.ts` files
   */
  testMatch: string | string[],
}

export interface CheckGroupProps {
  /**
   * The name of the check group.
   */
  name: string
  /**
   * Determines if the checks in the group are running or not.
   */
  activated?: boolean
  /**
   * Determines if any notifications will be sent out when a check in this group fails and/or recovers.
   */
  muted?: boolean
  /**
   * Setting this to "true" will trigger a retry when a check fails from the failing region and another,
   * randomly selected region before marking the check as failed.
   * @deprecated Use {@link CheckGroupProps.retryStrategy} instead.
   */
  doubleCheck?: boolean
  /**
   * The runtime version, i.e. fixed set of runtime dependencies, used to execute checks in this group.
   */
  runtimeId?: string
  /**
   * An array of one or more data center locations where to run the checks.
   */
  locations?: Array<keyof Region>
  /**
   * An array of one or more private locations where to run the checks.
   */
  privateLocations?: Array<string|PrivateLocation>
  /**
   * Tags for organizing and filtering checks.
   */
  tags?: Array<string>
  /**
   * Determines how many checks are invoked concurrently when triggering a check group from CI/CD or through the API.
   */
  concurrency?: number
  /**
   * Optional fallback value for checks belonging to the group. How often the check should run in minutes.
   */
  frequency?: number | Frequency
  environmentVariables?: Array<EnvironmentVariable>
  /**
   * List of alert channels to be alerted when checks in this group fail or recover.
   */
  alertChannels?: Array<AlertChannel>
  browserChecks?: BrowserCheckConfig,
  multiStepChecks?: MultiStepCheckConfig,
  alertEscalationPolicy?: AlertEscalation,
  /**
   * A valid piece of Node.js code to run in the setup phase of an API check in this group.
  * @deprecated use the "ApiCheck.setupScript" property instead and use common JS/TS code
  * composition to add group specific setup routines.
  */
  localSetupScript?: string
  /**
   * A valid piece of Node.js code to run in the teardown phase of an API check in this group.
  * @deprecated use the "ApiCheck.tearDownScript" property instead and use common JS/TS code
  * composition to add group specific teardown routines.
   */
  localTearDownScript?: string
  apiCheckDefaults?: ApiCheckDefaultConfig
  /**
   * Sets a retry policy for the group. Use RetryStrategyBuilder to create a retry policy.
   */
  retryStrategy?: RetryStrategy
  /**
   * Determines whether the checks in the group should run on all selected locations in parallel or round-robin.
   * See https://www.checklyhq.com/docs/monitoring/global-locations/ to learn more about scheduling strategies.
   */
  runParallel?: boolean
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
  activated?: boolean
  muted?: boolean
  doubleCheck?: boolean
  runtimeId?: string
  locations: Array<keyof Region>
  privateLocations?: Array<string|PrivateLocation>
  tags?: Array<string>
  concurrency?: number
  frequency?: number | Frequency
  environmentVariables?: Array<EnvironmentVariable>
  alertChannels?: Array<AlertChannel>
  localSetupScript?: string
  localTearDownScript?: string
  apiCheckDefaults: ApiCheckDefaultConfig
  browserChecks?: BrowserCheckConfig
  multiStepChecks?: MultiStepCheckConfig
  retryStrategy?: RetryStrategy
  runParallel?: boolean
  alertSettings?: AlertEscalation
  useGlobalAlertSettings?: boolean

  static readonly __checklyType = 'check-group'

  /**
   * Constructs the CheckGroup instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props CheckGroup configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#checkgroup Read more in the docs}
   */
  constructor (logicalId: string, props: CheckGroupProps) {
    super(CheckGroup.__checklyType, logicalId)
    this.name = props.name
    this.activated = props.activated
    this.muted = props.muted
    this.doubleCheck = props.doubleCheck
    this.tags = props.tags
    this.runtimeId = props.runtimeId
    this.locations = props.locations ?? []
    this.privateLocations = props.privateLocations
    this.concurrency = props.concurrency
    // `frequency` is not a CheckGroup resource property. Not present in synthesize()
    this.frequency = props.frequency
    this.apiCheckDefaults = { ...defaultApiCheckDefaults, ...props.apiCheckDefaults }
    this.alertSettings = props.alertEscalationPolicy
    this.useGlobalAlertSettings = !this.alertSettings
    this.environmentVariables = props.environmentVariables ?? []
    this.environmentVariables.forEach(ev => {
      // only empty string is checked because the KeyValuePair.value doesn't allow undefined or null.
      if (ev.value === '') {
        throw new Error(`Environment variable "${ev.key}" from check group "${logicalId}" is not allowed to be empty`)
      }
    })

    this.alertChannels = props.alertChannels ?? []
    this.localSetupScript = props.localSetupScript
    this.localTearDownScript = props.localTearDownScript
    this.retryStrategy = props.retryStrategy
    this.runParallel = props.runParallel
    // `browserChecks` is not a CheckGroup resource property. Not present in synthesize()
    this.browserChecks = props.browserChecks
    const fileAbsolutePath = Session.checkFileAbsolutePath!
    if (props.browserChecks?.testMatch) {
      this.__addChecks(fileAbsolutePath, props.browserChecks.testMatch, CheckTypes.BROWSER)
    }
    this.multiStepChecks = props.multiStepChecks
    if (props.multiStepChecks?.testMatch) {
      this.__addChecks(fileAbsolutePath, props.multiStepChecks.testMatch, CheckTypes.MULTI_STEP)
    }
    Session.registerConstruct(this)
    this.__addSubscriptions()
    this.__addPrivateLocationGroupAssignments()
  }

  private __addChecks (
    fileAbsolutePath: string,
    testMatch: string|string[],
    checkType: typeof CheckTypes.BROWSER | typeof CheckTypes.MULTI_STEP,
  ) {
    const parent = path.dirname(fileAbsolutePath)
    const matched = glob.sync(testMatch, { nodir: true, cwd: parent })
    for (const match of matched) {
      const filepath = path.join(parent, match)
      const props = {
        group: this,
        name: match,
        code: {
          entrypoint: filepath,
        },
        // the browserChecks props inherited from the group are applied in BrowserCheck.constructor()
      }
      const checkLogicalId = pathToPosix(path.relative(Session.basePath!, filepath))
      if (checkType === CheckTypes.BROWSER) {
        new BrowserCheck(checkLogicalId, props)
      } else {
        new MultiStepCheck(checkLogicalId, props)
      }
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

  private __addPrivateLocationGroupAssignments () {
    if (!this.privateLocations) {
      return
    }
    for (const privateLocation of this.privateLocations) {
      // slugName strings are processed in loadAllPrivateLocations()
      if (typeof privateLocation === 'string') {
        continue
      }

      // use private location assignment for instances
      const assignment = new PrivateLocationGroupAssignment(`private-location-group-assignment#${this.logicalId}#${privateLocation.logicalId}`, {
        privateLocationId: Ref.from(privateLocation.logicalId),
        groupId: Ref.from(this.logicalId),
      })
    }
  }

  public getCheckDefaults (): CheckConfigDefaults {
    // TODO: investigate if make sense to add all other check's properties
    return {
      frequency: this.frequency,
    }
  }

  public getBrowserCheckDefaults (): CheckConfigDefaults {
    // TODO: investigate if make sense to add all other browser-check's properties
    return {
      frequency: this.browserChecks?.frequency,
    }
  }

  public getMultiStepCheckDefaults (): CheckConfigDefaults {
    return {
      frequency: this.multiStepChecks?.frequency,
    }
  }

  synthesize () {
    return {
      name: this.name,
      activated: this.activated,
      muted: this.muted,
      tags: this.tags,
      locations: this.locations,
      runtimeId: this.runtimeId,

      // private-location instances are assigned with loadAllPrivateLocations()
      privateLocations: undefined,

      concurrency: this.concurrency,
      localSetupScript: this.localSetupScript,
      localTearDownScript: this.localTearDownScript,
      apiCheckDefaults: this.apiCheckDefaults,
      environmentVariables: this.environmentVariables,
      // The backend doesn't actually support the `NO_RETRIES` type, it uses `null` instead.
      retryStrategy: this.retryStrategy?.type === 'NO_RETRIES'
        ? null
        : this.retryStrategy,
      // When `retryStrategy: NO_RETRIES` and `doubleCheck: undefined`, we want to let the user disable all retries.
      // The backend has a Joi default of `doubleCheck: true`, though, so we need special handling for this case.
      doubleCheck: this.doubleCheck === undefined && this.retryStrategy?.type === 'NO_RETRIES'
        ? false
        : this.doubleCheck,
      runParallel: this.runParallel,
      alertSettings: this.alertSettings,
      useGlobalAlertSettings: this.useGlobalAlertSettings,
    }
  }
}
