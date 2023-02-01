import { Session } from './project'
import { Ref } from './ref'

export abstract class Construct {
  type: string
  logicalId: string
  constructor (type: string, logicalId: string) {
    Session.validateCreateConstruct(this)
    this.logicalId = logicalId
    this.type = type
  }

  ref () {
    return Ref.from(this.logicalId)
  }

  allowInChecklyConfig () {
    return false
  }

  abstract synthesize(): any
}
