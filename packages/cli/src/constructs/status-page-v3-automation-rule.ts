import { Construct } from './construct.js'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics.js'
import { Diagnostics } from './diagnostics.js'
import { Ref } from './ref.js'
import { Session } from './session.js'
import { StatusPageV3, StatusPageV3Ref } from './status-page-v3.js'
import { StatusPageV3Component, StatusPageV3ComponentRef } from './status-page-v3-component.js'

/**
 * The impact an automated incident sets on a component. Every non-operational
 * component status.
 */
export type StatusPageV3TargetImpact =
  | 'UNDER_MAINTENANCE'
  | 'DEGRADED_PERFORMANCE'
  | 'PARTIAL_OUTAGE'
  | 'MAJOR_OUTAGE'

export interface StatusPageV3AutomationRuleComponentProps {
  /**
   * The component the automated incident impacts.
   */
  component: StatusPageV3Component | StatusPageV3ComponentRef
  /**
   * The impact set on the component while the incident is open.
   */
  targetImpact: StatusPageV3TargetImpact
}

export interface StatusPageV3AutomationRuleProps {
  /**
   * The v3 status page this rule belongs to.
   */
  statusPage: StatusPageV3 | StatusPageV3Ref
  /**
   * The name of the rule.
   */
  name: string
  /**
   * A disabled rule never opens incidents. Defaults to true.
   */
  enabled?: boolean
  /**
   * Body of the status update that opens the incident.
   */
  firstUpdate: string
  /**
   * Body of the status update that resolves the incident.
   */
  lastUpdate: string
  /**
   * Whether subscribers are notified of the automated updates. Defaults to true.
   */
  notifySubscribers?: boolean
  /**
   * A failing check matches this rule when it, or its group, carries ANY of
   * these tags. At least one tag is required.
   */
  tags: string[]
  /**
   * Minimum minutes after an automated incident before this rule may open
   * the next one. 0 disables the cool down. Defaults to 5.
   */
  coolDownMinutes?: number
  /**
   * The components an automated incident impacts, with the impact each gets.
   */
  components: StatusPageV3AutomationRuleComponentProps[]
}

/**
 * Creates an Automation Rule for a v3 Status Page.
 *
 * When a check whose tags overlap with the rule's tags fails, Checkly opens
 * one incident on the page impacting the listed components, and resolves it
 * when the check recovers.
 */
export class StatusPageV3AutomationRule extends Construct {
  statusPage: StatusPageV3 | StatusPageV3Ref
  name: string
  enabled?: boolean
  firstUpdate: string
  lastUpdate: string
  notifySubscribers?: boolean
  tags: string[]
  coolDownMinutes?: number
  components: StatusPageV3AutomationRuleComponentProps[]

  static readonly __checklyType = 'status-page-automation-rule'

  /**
   * Constructs the Automation Rule instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props automation rule configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/status-page-v3-automation-rule/ Read more in the docs}
   */
  constructor (logicalId: string, props: StatusPageV3AutomationRuleProps) {
    super(StatusPageV3AutomationRule.__checklyType, logicalId)
    this.statusPage = props.statusPage
    this.name = props.name
    this.enabled = props.enabled
    this.firstUpdate = props.firstUpdate
    this.lastUpdate = props.lastUpdate
    this.notifySubscribers = props.notifySubscribers
    this.tags = props.tags
    this.coolDownMinutes = props.coolDownMinutes
    this.components = props.components

    Session.registerConstruct(this)
  }

  describe (): string {
    return `StatusPageV3AutomationRule:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    if (!(this.statusPage instanceof StatusPageV3) && !(this.statusPage instanceof StatusPageV3Ref)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'statusPage',
        new Error('Value must be a StatusPageV3 construct or StatusPageV3.fromId().'),
      ))
    }

    if (!Array.isArray(this.tags) || this.tags.length === 0) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'tags',
        new Error('Value must contain at least one tag.'),
      ))
    }

    if (this.coolDownMinutes !== undefined && (!Number.isInteger(this.coolDownMinutes) || this.coolDownMinutes < 0)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'coolDownMinutes',
        new Error('Value must be a non-negative integer.'),
      ))
    }

    for (const { component, targetImpact } of this.components ?? []) {
      if (targetImpact === ('OPERATIONAL' as string)) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'components',
          new Error(`"${component.logicalId}": targetImpact cannot be OPERATIONAL.`),
        ))
      }
      // A referenced component (fromId) can only be checked on the backend.
      if (component instanceof StatusPageV3Component && component.statusPage !== this.statusPage) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'components',
          new Error(`"${component.logicalId}" belongs to another status page than this rule.`),
        ))
      }
    }
  }

  synthesize (): any | null {
    return {
      statusPageId: Ref.from(this.statusPage.logicalId),
      name: this.name,
      enabled: this.enabled,
      firstUpdate: this.firstUpdate,
      lastUpdate: this.lastUpdate,
      notifySubscribers: this.notifySubscribers,
      tags: this.tags,
      coolDownWindowMinutes: this.coolDownMinutes,
      components: this.components.map(({ component, targetImpact }) => ({
        componentId: Ref.from(component.logicalId),
        targetImpact,
      })),
    }
  }
}
