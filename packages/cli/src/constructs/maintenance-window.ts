import { Construct } from './construct.js'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics.js'
import { Diagnostics } from './diagnostics.js'
import { Session } from './session.js'
import { KNOWN_TIME_ZONES, TimeZone } from './time-zone.js'

// UTC offsets are not IANA zone names and the API rejects them: "+05:00" style identifiers and the
// fixed-offset Etc/GMT±N zones, which have no daylight-saving rules. Etc/GMT+0 and Etc/GMT-0 are
// aliases of UTC and are accepted.
const FIXED_OFFSET_TIME_ZONE_PATTERN = /^[+-]|^Etc\/GMT[+-]0*[1-9]\d?$/i

const knownTimeZones: ReadonlySet<string> = new Set(KNOWN_TIME_ZONES)

function isValidTimeZone (timeZone: string): boolean {
  if (FIXED_OFFSET_TIME_ZONE_PATTERN.test(timeZone)) {
    return false
  }
  // Listed names skip the Intl check: older Node releases bundle older tzdata and would reject newer
  // zones that the list offers. The API remains the final authority either way.
  if (knownTimeZones.has(timeZone)) {
    return true
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

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
