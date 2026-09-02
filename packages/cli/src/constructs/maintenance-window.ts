import { Construct } from './construct.js'
import { Session } from './session.js'

export type MaintenanceWindowRepeatUnit = 'DAY' | 'WEEK' | 'MONTH'

export interface MaintenanceWindowProps {
  /**
   * The name of the maintenance window.
   */
  name: string
  /**
   * A list of one or more tags that filter which checks are affected by the maintenance window.
   * Not needed when `pauseAllChecks` is true.
   */
  tags?: Array<string>
  /**
   * The start date and time of the maintenance window in ISO 8601 format, "YYYY-MM-DDTHH:mm:ss.sssZ" as returned by
   * `new Date()`
   */
  startsAt: Date
  /**
   * The end date and time of the maintenance window in ISO 8601 format, "YYYY-MM-DDTHH:mm:ss.sssZ" as returned by
   * `new Date()`
   */
  endsAt: Date
  /**
   * The repeat interval of the maintenance window from the first occurrence.
   */
  repeatInterval?: number
  /**
   * The repeat strategy for the maintenance window. This is mandatory when you specify a repeat interval.
   */
  repeatUnit?: MaintenanceWindowRepeatUnit
  /**
   * The end date and time when the maintenance window should stop repeating.
   */
  repeatEndsAt?: Date
  /**
   * Named IANA time zone used for recurring maintenance scheduling, e.g. "America/New_York".
   * UTC offset identifiers such as "+05:00" are not accepted. Defaults to UTC.
   */
  timezone?: string
  /**
   * When true, checks are paused for every check in the account, regardless of `tags`.
   */
  pauseAllChecks?: boolean
  /**
   * A list of tags that filter which checks have their alerts silenced. Ignored when
   * `silenceAllAlerts` is true.
   */
  silenceAlertsTags?: Array<string>
  /**
   * When true, alerts are silenced for every check in the account, overriding
   * `silenceAlertsTags`.
   */
  silenceAllAlerts?: boolean
}

/**
 * Creates a Maintenance Window
 *
 * @remarks
 *
 * This class make use of the Maintenance Window endpoints.
 */
export class MaintenanceWindow extends Construct {
  name: string
  tags?: Array<string>
  startsAt: Date
  endsAt: Date
  repeatInterval?: number
  repeatUnit?: MaintenanceWindowRepeatUnit
  repeatEndsAt?: Date
  timezone?: string
  pauseAllChecks?: boolean
  silenceAlertsTags?: Array<string>
  silenceAllAlerts?: boolean

  static readonly __checklyType = 'maintenance-window'

  /**
   * Constructs the Maintenance Window instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props maintenance window configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/maintenance-window/ Read more in the docs}
   */
  constructor (logicalId: string, props: MaintenanceWindowProps) {
    super(MaintenanceWindow.__checklyType, logicalId)
    this.name = props.name
    this.tags = props.tags
    this.startsAt = props.startsAt
    this.endsAt = props.endsAt
    this.repeatInterval = props.repeatInterval
    this.repeatUnit = props.repeatUnit
    this.repeatEndsAt = props.repeatEndsAt
    this.timezone = props.timezone
    this.pauseAllChecks = props.pauseAllChecks
    this.silenceAlertsTags = props.silenceAlertsTags
    this.silenceAllAlerts = props.silenceAllAlerts
    Session.registerConstruct(this)
  }

  describe (): string {
    return `MaintenanceWindow:${this.logicalId}`
  }

  synthesize (): any | null {
    return {
      name: this.name,
      tags: this.tags,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      repeatInterval: this.repeatInterval,
      repeatUnit: this.repeatUnit,
      repeatEndsAt: this.repeatEndsAt,
      timezone: this.timezone,
      pauseAllChecks: this.pauseAllChecks,
      silenceAlertsTags: this.silenceAlertsTags,
      silenceAllAlerts: this.silenceAllAlerts,
    }
  }
}
