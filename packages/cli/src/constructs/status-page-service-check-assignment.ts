import { Ref } from './ref'
import { Construct } from './construct'
import { Session } from './project'

export interface StatusPageServiceCheckAssignmentProps {
  statusPageServiceId: Ref
  checkId?: Ref
}

/**
 * Creates a Check assignment for a Status Page Service
 */
export class StatusPageServiceCheckAssignment extends Construct {
  statusPageServiceId: Ref
  checkId?: Ref

  static readonly __checklyType = 'status-page-service-check-assignment'

  /**
   * Constructs the Status Page Service Check Assignment instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props status page check assignment configuration properties
   */
  constructor (logicalId: string, props: StatusPageServiceCheckAssignmentProps) {
    super(StatusPageServiceCheckAssignment.__checklyType, logicalId)
    this.statusPageServiceId = props.statusPageServiceId
    this.checkId = props.checkId
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      statusPageServiceId: this.statusPageServiceId,
      checkId: this.checkId,
    }
  }
}
