import { Session } from './project'
import { Ref } from './ref'

export abstract class Construct {
  type: string
  logicalId: string
  __checkFilePath?: string
  constructor (type: string, logicalId: string) {
    this.logicalId = logicalId
    this.type = type
    this.__checkFilePath = Session.checkFilePath
    Session.validateCreateConstruct(this)
  }

  ref () {
    return Ref.from(this.logicalId)
  }

  allowInChecklyConfig () {
    return false
  }

  getSourceFile () {
    return this.__checkFilePath
  }

  abstract synthesize(): any
}
