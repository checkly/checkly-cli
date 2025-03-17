import { Ref, sourceForRef } from './ref'
import { Construct } from './construct'
import { Session } from './project'
import { expr, ident, Program } from '../sourcegen'

export interface PrivateLocationCheckAssignmentProps {
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
export class PrivateLocationCheckAssignment extends Construct {
  privateLocationId: Ref
  checkId?: Ref

  static readonly __checklyType = 'private-location-check-assignment'

  /**
   * Constructs the Private Location Assignment instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props private location assignment configuration properties
   */
  constructor (logicalId: string, props: PrivateLocationCheckAssignmentProps) {
    super(PrivateLocationCheckAssignment.__checklyType, logicalId)
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

  source (program: Program): void {
    program.import('PrivateLocationCheckAssignment', 'checkly/constructs')

    program.value(expr(ident('PrivateLocationCheckAssignment'), builder => {
      builder.new(builder => {
        builder.string(this.logicalId)
        builder.object(builder => {
          builder.value('privateLocationId', sourceForRef(program, this.privateLocationId))

          if (this.checkId) {
            builder.value('checkId', sourceForRef(program, this.checkId))
          }
        })
      })
    }))
  }
}
