import { Construct } from './construct'
import { Session } from './project'

export interface StatusPageServiceProps {
  name: string
}

/**
 * Creates a Dashboard
 *
 * @remarks
 *
 * This class make use of the Dashboard endpoints.
 */
export class StatusPageService extends Construct {
  name: string

  static readonly __checklyType = 'status-page-service'

  /**
   * Constructs the Dashboard instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props dashboard configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#dashboard Read more in the docs}
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
