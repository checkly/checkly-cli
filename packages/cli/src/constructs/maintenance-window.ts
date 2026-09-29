import { Construct } from './construct.js'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics.js'
import { Diagnostics, WarningDiagnostic } from './diagnostics.js'
import { Session } from './session.js'
import { isValidTimeZone, TimeZone } from './time-zone.js'

export type MaintenanceWindowRepeatUnit = 'DAY' | 'WEEK' | 'MONTH'

export interface MaintenanceWindowProps {
  /**
   * The name of the maintenance window.
   */
  name: string
  /**
   * Tags that select which checks are paused during the maintenance window.
   * A window must set at least one of `tags`, `pauseAllChecks`, `silenceAlertsTags` or `silenceAllAlerts`.
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
   * The named IANA time zone used to schedule recurring occurrences, e.g. `'America/New_York'`.
   * Occurrences keep the same local time across daylight-saving changes.
   *
   * `startsAt` and `endsAt` remain absolute instants; the time zone does not reinterpret them.
   * UTC offsets such as `'+05:00'` or `'Etc/GMT+5'` are not accepted. When omitted, the window is
   * scheduled in UTC, and removing a previously set time zone resets the window to UTC on the next
   * deploy. The time zone cannot be changed while a maintenance is active.
   */
  timezone?: TimeZone
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
  timezone?: TimeZone
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

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    if (this.timezone !== undefined && !isValidTimeZone(this.timezone)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'timezone',
        new Error(
          `"timezone" must be a named IANA time zone such as "America/New_York", got "${this.timezone}".`
          + ` UTC offsets such as "+05:00" or "Etc/GMT+5" are not supported.`,
        ),
      ))
    }

    const pausesChecks = this.pauseAllChecks || !!this.tags?.length
    const silencesAlerts = this.silenceAllAlerts || !!this.silenceAlertsTags?.length
    if (!pausesChecks && !silencesAlerts) {
      diagnostics.add(new WarningDiagnostic({
        title: 'Maintenance window affects no checks',
        message:
          `Maintenance window "${this.logicalId}" neither pauses checks nor silences alerts. `
          + `Set "tags" or "pauseAllChecks" to pause checks, or "silenceAlertsTags" or "silenceAllAlerts" `
          + `to silence alerts.`,
      }))
    }
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
      // An omitted timezone keeps the stored value on update, so null is sent to reset it to UTC.
      timezone: this.timezone ?? null,
      pauseAllChecks: this.pauseAllChecks,
      silenceAlertsTags: this.silenceAlertsTags,
      silenceAllAlerts: this.silenceAllAlerts,
    }
  }
}
