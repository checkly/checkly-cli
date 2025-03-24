import { Construct } from './construct'
import { Session } from './project'

export interface StatusPageServiceProps {
  /**
   * The name of the service.
   */
  name: string
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
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#statuspageservice Read more in the docs}
   */
  constructor (logicalId: string, props: StatusPageServiceProps) {
    super(StatusPageService.__checklyType, logicalId)
    this.name = props.name

    Session.registerConstruct(this)
  }

  synthesize (): any|null {
    return {
      name: this.name,
    }
  }
}
