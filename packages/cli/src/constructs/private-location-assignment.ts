import { Ref } from './ref'
import { Construct } from './construct'
import { Session } from './project'

export interface PrivateLocationAssignmentProps {
  privateLocationId: Ref
  checkId?: Ref
}

/**
 * Creates an Private Location Assignment
 *
 * @remarks
 *
 * This class make use of the Private Location Assignment endpoints.
 */
export class PrivateLocationAssignment extends Construct {
  privateLocationId: Ref
  checkId?: Ref

  static readonly __checklyType = 'private-location-assignment'

  /**
   * Constructs the Private Location Assignment instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props private location assignment configuration properties
   */
  constructor (logicalId: string, props: PrivateLocationAssignmentProps) {
    super(PrivateLocationAssignment.__checklyType, logicalId)
    this.privateLocationId = props.privateLocationId
    this.checkId = props.checkId
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      privateLocationId: this.privateLocationId,
      checkId: this.checkId,
    }
  }
}
