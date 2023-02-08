import { Session } from './project'
import { Ref } from './ref'
import { ValidationError } from './validator-error'

export abstract class Construct {
  type: string
  logicalId: string
  constructor (type: string, logicalId: string) {
    if (!/^[A-Za-z0-9_\-/#.]+$/.test(logicalId)) {
      throw new ValidationError('The `logicalId` must includes only allowed characters [A-Za-z0-9_-/#.]')
    }
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
