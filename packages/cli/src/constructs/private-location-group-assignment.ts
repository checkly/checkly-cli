import { Ref } from './ref'
import { Construct } from './construct'
import { Session } from './project'

export interface PrivateLocationGroupAssignmentProps {
  privateLocationId: Ref
  groupId?: Ref
}

/**
 * Creates an Private Location Group Assignment
 *
 * @remarks
 *
 * This class make use of the Private Location Group Assignment endpoints.
 */
export class PrivateLocationGroupAssignment extends Construct {
  privateLocationId: Ref
  groupId?: Ref

  static readonly __checklyType = 'private-location-group-assignment'

  /**
   * Constructs the Private Location GroupAssignment instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props private location group assignment configuration properties
   */
  constructor (logicalId: string, props: PrivateLocationGroupAssignmentProps) {
    super(PrivateLocationGroupAssignment.__checklyType, logicalId)
    this.privateLocationId = props.privateLocationId
    this.groupId = props.groupId
    Session.registerConstruct(this)
  }

  describe (): string {
    return `PrivateLocationGroupAssignment:${this.logicalId}`
  }

  synthesize () {
    return {
      privateLocationId: this.privateLocationId,
      groupId: this.groupId,
    }
  }
}
