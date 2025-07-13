import path from 'node:path'

import { glob } from 'glob'

import { AlertChannel, AlertChannelRef } from './alert-channel'
import { EnvironmentVariable } from './environment-variable'
import { PrivateLocation, PrivateLocationRef } from './private-location'
import { ApiCheckDefaultConfig } from './api-check'
import type { Region } from '..'
import { type Frequency } from './frequency'
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type RetryStrategyBuilder, // Used for @links in comments.
} from './retry-strategy'
import { AlertEscalation } from './alert-escalation-policy'
import { Diagnostics } from './diagnostics'
import { DeprecatedConstructDiagnostic, DeprecatedPropertyDiagnostic, InvalidPropertyValueDiagnostic } from './construct-diagnostics'
import CheckTypes from '../constants'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { pathToPosix } from '../services/util'
import { AlertChannelSubscription } from './alert-channel-subscription'
import { BrowserCheck } from './browser-check'
import { CheckGroupRef } from './check-group-ref'
import { Construct } from './construct'
import { MultiStepCheck } from './multi-step-check'
import { PrivateLocationGroupAssignment } from './private-location-group-assignment'
import { Ref } from './ref'
import { Session } from './project'
import { validateDeprecatedDoubleCheck } from './internal/common-diagnostics'
import { CheckRetryStrategy } from './check'
import { MonitorRetryStrategy } from './monitor'

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
  testMatch: string | string[]
}

type MultiStepCheckConfig = CheckConfigDefaults & {
  /**
   * Glob pattern to include multiple files, i.e. all `.spec.ts` files
   */
  testMatch: string | string[]
}

/**
 * Retry strategies supported by groups.
 */
export type GroupRetryStrategy =
  | CheckRetryStrategy
  | MonitorRetryStrategy

export interface CheckGroupV1Props {
  /**
   * The name of the check group.
   */
  name: string

  /**
   * Determines whether the checks in the group are running or not.
   *
   * When `true` (default), all checks in the group that are activated will run.
   *
   * When `false`, no checks in the group will run, regardless of whether they
   * are activated or not.
   *
   * If not set, the default is `true`.
   */
  activated?: boolean

  /**
   * Determines if any notifications will be sent out when a check in this
   * group fails and/or recovers.
  *
   * When `false` (default), all checks in the group that are not muted will trigger
   * alerts.
   *
   * When `true`, all checks in the group act as if they are muted, regardless
   * of their own state, and will not trigger alerts.
   *
   * If not set, the default is `false`.
   */
  muted?: boolean

  /**
   * Setting this to "true" will trigger a retry when a check fails from
   * the failing region and another, randomly selected region before marking
   * the check as failed.
   *
   * If set, overrides the doubleCheck property of all checks in the group.
   *
   * If not set, the default is `true`.
   *
   * @deprecated Use {@link CheckGroupV1Props.retryStrategy} instead.
   */
  doubleCheck?: boolean

  /**
   * The runtime version, i.e. fixed set of runtime dependencies, used to
   * execute checks in this group.
   *
   * This value is only used as a fallback for checks that do not explicitly
   * choose a runtime.
   *
   * If not set, the ultimate fallback is the account default runtime.
   */
  runtimeId?: string

  /**
   * An array of one or more data center locations where to run the checks.
   *
   * If either {@link CheckGroupV1Props.locations} or
   * {@link CheckGroupV1Props.privateLocations} is set to a non-empty value, all
   * checks in the group will use those values instead of their own.
   */
  locations?: (keyof Region)[]

  /**
   * An array of one or more private locations where to run the checks.
   *
   * If either {@link CheckGroupV1Props.locations} or
   * {@link CheckGroupV1Props.privateLocations} is set to a non-empty value, all
   * checks in the group will use those values instead of their own.
   */
  privateLocations?: (string | PrivateLocation | PrivateLocationRef)[]

  /**
   * Tags for organizing and filtering checks.
   *
   * Checks in the group will behave as if they had the these tags set, though
   * they may not be visible.
   */
  tags?: string[]

  /**
   * Determines how many checks are invoked concurrently when triggering a
   * check group from CI/CD or through the API.
   */
  concurrency?: number

  /**
   * Optional fallback value for all checks belonging to the group. How often
   * the check should run in minutes.
   *
   * Note that this settings is stored at the check level and is not persisted
   * in the group.
   */
  frequency?: number | Frequency

  /**
   * When set, any environment variables defined here will be available to
   * all checks in the group.
   *
   * If a global environment variable with the same name exists, the group
   * environment variable will override it.
   *
   * If a check environment variable with the same name exists, it will
   * override the group environment variable.
   *
   * See https://www.checklyhq.com/docs/groups/variables/#variable-hierarchy
   * for more information.
   */
  environmentVariables?: EnvironmentVariable[]

  /**
   * List of alert channels to be alerted when checks in this group fail or
   * recover.
   */
  alertChannels?: (AlertChannel | AlertChannelRef)[]

  /**
   * This optional setting can be used to provide CLI-level defaults for
   * all browser checks in the group.
   *
   * Note that any settings defined here are stored at the check level and are
   * not persisted in the group.
   *
   * Currently only the following settings have an effect:
   * - {@link BrowserCheckConfig.frequency}
   */
  browserChecks?: BrowserCheckConfig

  /**
   * This optional setting can be used to provide CLI-level defaults for
   * all multi-step checks in the group.
   *
   * Note that any settings defined here are stored at the check level and are
   * not persisted in the group.
   *
   * Currently only the following settings have an effect:
   * - {@link MultiStepCheckConfig.frequency}
   */
  multiStepChecks?: MultiStepCheckConfig

  /**
   * If set, all checks in the group will use the group's alert escalation
   * policy.
   *
   * If not set, all checks in the group will use the global alert escalation
   * policy.
   */
  alertEscalationPolicy?: AlertEscalation

  /**
   * A valid piece of Node.js code to run in the setup phase of an API check
   * in this group.
   *
   * @deprecated Use the "ApiCheck.setupScript" property instead and use
   * common JS/TS code composition to add group specific setup routines.
   */
  localSetupScript?: string

  /**
   * A valid piece of Node.js code to run in the teardown phase of an API
   * check in this group.
   *
   * @deprecated use the "ApiCheck.tearDownScript" property instead and use
   * common JS/TS code composition to add group specific teardown routines.
   */
  localTearDownScript?: string

  /**
   * If set, the values provided here are merged with the values defined
   * in individual API checks.
   */
  apiCheckDefaults?: ApiCheckDefaultConfig

  /**
   * Sets a retry policy for the group. Use {@link RetryStrategyBuilder} to
   * create a retry policy.
   *
   * If set, all checks in the group use the group's retry strategy.
   *
   * If not set, retries are disabled for all checks in the group.
   */
  retryStrategy?: GroupRetryStrategy

  /**
   * Determines whether the checks in the group should run on all selected
   * locations in parallel or round-robin.
   *
   * When `true`, all checks in the group run in parallel regardless of their
   * individual setting.
   *
   * When `false`, all checks in the group run in round-robin regardless of
   * their individual setting.
   *
   * If not set, the default is `false`.
   *
   * See https://www.checklyhq.com/docs/monitoring/global-locations/ to learn
   * more about scheduling strategies.
   */
  runParallel?: boolean
}

/**
 * Creates a Check Group (v1).
 *
 * We strongly recommend upgrading to {@link CheckGroupV2} instead.
 *
 * The original CheckGroup v1 comes with implicit defaults that are not
 * intuitive and make it impossible to keep check-level behavior for
 * certain properties.
 *
 * The following properties will always use the group's values if set, or
 * implicit defaults if not set:
 *
 *   - {@link CheckGroupV1Props.alertEscalationPolicy}
 *   - {@link CheckGroupV1Props.retryStrategy}
 *   - {@link CheckGroupV1Props.runParallel}
 *
 * Please check the documentation for the individual properties to see their
 * behavior.
 *
 * For more information regarding the update, please see:
 *   https://feedback.checklyhq.com/changelog/checkly-groups-update-organize-checks-your-way
 *
 * @deprecated Use {@link CheckGroupV2} instead.
 */
export class CheckGroupV1 extends Construct {
  name: string
  activated?: boolean
  muted?: boolean
  doubleCheck?: boolean
  runtimeId?: string
  locations: Array<keyof Region>
  privateLocations?: Array<string | PrivateLocation | PrivateLocationRef>
  tags?: Array<string>
  concurrency?: number
  frequency?: number | Frequency
  environmentVariables?: Array<EnvironmentVariable>
  alertChannels?: Array<AlertChannel | AlertChannelRef>
  localSetupScript?: string
  localTearDownScript?: string
  apiCheckDefaults: ApiCheckDefaultConfig
  browserChecks?: BrowserCheckConfig
  multiStepChecks?: MultiStepCheckConfig
  retryStrategy?: GroupRetryStrategy
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
  constructor (logicalId: string, props: CheckGroupV1Props) {
    super(CheckGroupV1.__checklyType, logicalId)
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

  describe (): string {
    return `CheckGroupV1:${this.logicalId}`
  }

  // eslint-disable-next-line require-await
  protected async onBeforeValidate (diagnostics: Diagnostics): Promise<void> {
    diagnostics.add(new DeprecatedConstructDiagnostic(
      'CheckGroup',
      new Error(
        `Please update to CheckGroupV2 which has more intuitive behavior.`
        + `\n\n`
        + `For more information, please see:\n`
        + `  https://feedback.checklyhq.com/changelog/checkly-groups-update-organize-checks-your-way`,
      ),
    ))
  }

  protected async validateDoubleCheck (diagnostics: Diagnostics): Promise<void> {
    await validateDeprecatedDoubleCheck(diagnostics, this)
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    await this.onBeforeValidate(diagnostics)

    await this.validateDoubleCheck(diagnostics)

    if (this.environmentVariables) {
      this.environmentVariables.forEach(ev => {
        // only empty string is checked because the KeyValuePair.value doesn't allow undefined or null.
        if (ev.value === '') {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'environmentVariables',
            new Error(`Value must not be empty.`),
          ))
        }
      })
    }

    if (this.localSetupScript) {
      diagnostics.add(new DeprecatedPropertyDiagnostic(
        'localSetupScript',
        new Error(
          `Use the setupScript property directly in your ApiChecks instead.`,
        ),
      ))
    }

    if (this.localTearDownScript) {
      diagnostics.add(new DeprecatedPropertyDiagnostic(
        'localTearDownScript',
        new Error(
          `Use the tearDownScript property directly in your ApiChecks instead.`,
        ),
      ))
    }
  }

  static fromId (id: number) {
    return new CheckGroupRef(`check-group-${id}`, id)
  }

  private __addChecks (
    fileAbsolutePath: string,
    testMatch: string | string[],
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
