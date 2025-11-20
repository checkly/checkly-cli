import { Construct } from './construct'
import { Session } from './project'

export type MaintenanceWindowRepeatUnit = 'DAY' | 'WEEK' | 'MONTH'

export interface MaintenanceWindowProps {
  /**
   * The name of the maintenance window.
   */
  name: string
  /**
   * A list of one or more tags that filter which checks are affected by the maintenance window.
   */
  tags: Array<string>
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
  tags: Array<string>
  startsAt: Date
  endsAt: Date
  repeatInterval?: number
  repeatUnit?: MaintenanceWindowRepeatUnit
  repeatEndsAt?: Date

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
    }
  }
}
