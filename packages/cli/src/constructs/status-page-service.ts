import { Construct } from './construct'
import { Diagnostics } from './diagnostics'
import { validatePhysicalIdIsUuid } from './internal/common-diagnostics'
import { Session } from './project'

export interface StatusPageServiceProps {
  /**
   * The name of the service.
   */
  name: string
}

/**
 * Creates a reference to an existing Status Page Service.
 *
 * References link existing resources to a project without managing them.
 *
 * Use {@link StatusPageService.fromId()} instead of instantiating this class directly.
 */
export class StatusPageServiceRef extends Construct {
  constructor (logicalId: string, physicalId: string) {
    super(StatusPageService.__checklyType, logicalId, physicalId, false)
    Session.registerConstruct(this)
  }

  describe (): string {
    return `StatusPageServiceRef:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)
    await validatePhysicalIdIsUuid(diagnostics, 'StatusPageService', this.physicalId)
  }

  synthesize () {
    return null
  }
}

/**
 * Creates a Service for Status Pages
 */
export class StatusPageService extends Construct {
  name: string

  static readonly __checklyType = 'status-page-service'

  /**
   * Constructs the Status Page Service instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props status page service configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/status-page-service/ Read more in the docs}
   */
  constructor (logicalId: string, props: StatusPageServiceProps) {
    super(StatusPageService.__checklyType, logicalId)
    this.name = props.name

    Session.registerConstruct(this)
  }

  describe (): string {
    return `StatusPageService:${this.logicalId}`
  }

  /**
   * @param id - The UUID of the existing status page service
   */
  static fromId (id: string) {
    return new StatusPageServiceRef(`status-page-service-${id}`, id)
  }

  synthesize (): any | null {
    return {
      name: this.name,
    }
  }
}
