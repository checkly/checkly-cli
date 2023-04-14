import { Session } from './project'
import { Ref } from './ref'

export abstract class Construct {
  type: string
  logicalId: string
  physicalId?: string|number
  constructor (type: string, logicalId: string, physicalId?: string|number) {
    this.logicalId = logicalId
    this.type = type
    this.physicalId = physicalId
    Session.validateCreateConstruct(this)
  }

  ref () {
    return Ref.from(this.logicalId)
  }

  allowInChecklyConfig () {
    return false
  }

  abstract synthesize(): any|null
}

export interface Entrypoint {
  entrypoint: string
}

export interface Content {
  content: string
}
