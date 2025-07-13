import { CheckConfigDefaults, MonitorConfigDefaults } from '../services/checkly-config-loader'
import { CheckGroupV1 } from './check-group-v1'
import { Construct } from './construct'
import { Session } from './project'

/**
 * Creates a reference to an existing Check Group (both v1 and v2).
 *
 * References link existing resources to a project without managing them.
 */
export class CheckGroupRef extends Construct {
  constructor (logicalId: string, physicalId: string|number) {
    super(CheckGroupV1.__checklyType, logicalId, physicalId, false)
    Session.registerConstruct(this)
  }

  public getCheckDefaults (): CheckConfigDefaults {
    // The only value CheckGroup.getCheckDefaults() returns is frequency,
    // which exists purely for convenience, and only at CLI-level. It never
    // gets sent to the backend. If references are being used, no access to
    // this feature is required, and it can be ignored entirely.
    return {}
  }

  public getBrowserCheckDefaults (): CheckConfigDefaults {
    // See the comment for getCheckDefaults(), the same applies here.
    return {}
  }

  public getMultiStepCheckDefaults (): CheckConfigDefaults {
    // See the comment for getCheckDefaults(), the same applies here.
    return {}
  }

  public getMonitorDefaults (): MonitorConfigDefaults {
    // See the comment for getCheckDefaults(), the same applies here.
    return {}
  }

  synthesize () {
    return null
  }
}
