import { Session } from './project'

class Construct {
  logicalId: string
  constructor (logicalId: string) {
    this.logicalId = logicalId
  }

  register (type: string, logicalId: string, resource: any) {
    Session.project.addResource(type, logicalId, resource)
  }
}

export default Construct
