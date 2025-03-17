import { Program } from '../sourcegen'
import { Session } from './project'
import { Ref } from './ref'

export abstract class Construct {
  type: string
  logicalId: string
  physicalId?: string|number
  member: boolean
  constructor (type: string, logicalId: string, physicalId?: string|number, member?: boolean) {
    this.logicalId = logicalId
    this.type = type
    this.physicalId = physicalId
    this.member = member ?? true
    Session.validateCreateConstruct(this)
  }

  ref () {
    return Ref.from(this.logicalId)
  }

  allowInChecklyConfig () {
    return false
  }

  abstract synthesize(): any|null

  abstract source (program: Program): void
}

export interface Entrypoint {
  entrypoint: string
}

export interface Content {
  content: string
}
