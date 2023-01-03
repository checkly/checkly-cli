import { Session } from './project'

export class Construct {
  logicalId: string
  constructor (logicalId: string) {
    this.logicalId = logicalId
  }

  register (type: string, logicalId: string, resource: any) {
    if (!Session.project) {
      throw new Error('A project is not registered to the session')
    }
    Session.project.addResource(type, logicalId, resource)
  }
}
