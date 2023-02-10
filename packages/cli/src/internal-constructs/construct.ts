import { Session, Ref } from '.'

export abstract class Construct {
  type: string
  logicalId: string
  constructor (type: string, logicalId: string) {
    this.logicalId = logicalId
    this.type = type
    Session.validateCreateConstruct(this)
  }

  ref () {
    return Ref.from(this.logicalId)
  }

  allowInChecklyConfig () {
    return false
  }

  abstract synthesize(): any
}
