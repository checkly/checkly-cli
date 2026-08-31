import { Construct } from './construct.js'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics.js'
import { Diagnostics } from './diagnostics.js'
import { validatePhysicalIdIsUuid } from './internal/common-diagnostics.js'
import { Ref } from './ref.js'
import { Session } from './session.js'
import { StatusPageV3, StatusPageV3Ref } from './status-page-v3.js'

export type StatusPageV3ComponentType = 'SERVICE' | 'GROUP'

export interface StatusPageV3ComponentProps {
  /**
   * The v3 status page this component belongs to. A component belongs to
   * exactly one page and cannot be moved to another one later.
   */
  statusPage: StatusPageV3 | StatusPageV3Ref
  /**
   * `SERVICE` (a monitored thing with its own status) or `GROUP` (a
   * container for other components). Defaults to `SERVICE`.
   */
  type?: StatusPageV3ComponentType
  /**
   * The name shown on the status page.
   */
  name: string
  /**
   * An optional description shown next to the name.
   */
  description?: string
  /**
   * Hide the component from the public page while keeping it available for
   * incidents and automation. Defaults to false.
   */
  hidden?: boolean
  /**
   * Position among its siblings; lower comes first.
   */
  displayOrder: number
  /**
   * The GROUP component to nest this component under. Must be on the same
   * status page.
   */
  parent?: StatusPageV3Component | StatusPageV3ComponentRef
}

/**
 * Creates a reference to an existing v3 Status Page Component.
 *
 * Use {@link StatusPageV3Component.fromId()} instead of instantiating this class directly.
 */
export class StatusPageV3ComponentRef extends Construct {
  constructor (logicalId: string, physicalId: string) {
    super(StatusPageV3Component.__checklyType, logicalId, physicalId, false)
    Session.registerConstruct(this)
  }

  describe (): string {
    return `StatusPageV3ComponentRef:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)
    await validatePhysicalIdIsUuid(diagnostics, 'StatusPageV3Component', this.physicalId)
  }

  synthesize () {
    return null
  }
}

/**
 * Creates a Component of a v3 Status Page
 */
export class StatusPageV3Component extends Construct {
  statusPage: StatusPageV3 | StatusPageV3Ref
  // Not `type`: that is the Construct's resource-type key.
  componentType: StatusPageV3ComponentType
  name: string
  description?: string
  hidden?: boolean
  displayOrder: number
  parent?: StatusPageV3Component | StatusPageV3ComponentRef

  static readonly __checklyType = 'status-page-component'

  /**
   * Constructs the Status Page Component instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props component configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/status-page-v3-component/ Read more in the docs}
   */
  constructor (logicalId: string, props: StatusPageV3ComponentProps) {
    super(StatusPageV3Component.__checklyType, logicalId)
    this.statusPage = props.statusPage
    this.componentType = props.type ?? 'SERVICE'
    this.name = props.name
    this.description = props.description
    this.hidden = props.hidden
    this.displayOrder = props.displayOrder
    this.parent = props.parent

    Session.registerConstruct(this)
  }

  describe (): string {
    return `StatusPageV3Component:${this.logicalId}`
  }

  /**
   * @param id - The UUID of the existing status page component
   */
  static fromId (id: string) {
    return new StatusPageV3ComponentRef(`status-page-component-${id}`, id)
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    if (!(this.statusPage instanceof StatusPageV3) && !(this.statusPage instanceof StatusPageV3Ref)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'statusPage',
        new Error('Value must be a StatusPageV3 construct or StatusPageV3.fromId().'),
      ))
    }

    if (this.componentType !== 'SERVICE' && this.componentType !== 'GROUP') {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'type',
        new Error(`Value must be "SERVICE" or "GROUP".`),
      ))
    }

    if (this.hidden !== undefined && typeof this.hidden !== 'boolean') {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'hidden',
        new Error('Value must be a boolean.'),
      ))
    }

    if (!Number.isInteger(this.displayOrder)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'displayOrder',
        new Error('Value must be an integer.'),
      ))
    }

    // A referenced parent (fromId) can only be checked on the backend.
    if (this.parent instanceof StatusPageV3Component) {
      if (this.parent.componentType !== 'GROUP') {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'parent',
          new Error(`Value must be a GROUP component ("${this.parent.logicalId}" is a ${this.parent.componentType}).`),
        ))
      }
      if (this.parent.statusPage !== this.statusPage) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'parent',
          new Error(`Value must be a component of the same status page ("${this.parent.logicalId}" belongs to another page).`),
        ))
      }
    }
  }

  synthesize (): any | null {
    return {
      statusPageId: Ref.from(this.statusPage.logicalId),
      parentId: this.parent ? Ref.from(this.parent.logicalId) : null,
      type: this.componentType,
      name: this.name,
      description: this.description,
      hidden: this.hidden,
      displayOrder: this.displayOrder,
    }
  }
}
