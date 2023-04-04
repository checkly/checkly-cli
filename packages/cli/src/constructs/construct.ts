import { Session } from './project'
import { Ref } from './ref'

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

export interface Entrypoint {
  entrypoint: string
}

export interface Content {
  content: string
}
