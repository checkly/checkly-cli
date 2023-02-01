import { Ref } from './ref'

export abstract class Construct {
  type: string
  logicalId: string
  constructor (type: string, logicalId: string) {
    this.logicalId = logicalId
    this.type = type
  }

  ref () {
    return Ref.from(this.logicalId)
  }

  abstract synthesize(): any
}
