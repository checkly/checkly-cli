import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { CheckGroupV1 } from './check-group-v1'
import { Construct } from './construct'
import { Diagnostics } from './diagnostics'
import { validatePhysicalIdIsNumeric } from './internal/common-diagnostics'
import { Session } from './project'

/**
 * Creates a reference to an existing Check Group (both v1 and v2).
 *
 * References link existing resources to a project without managing them.
 *
 * Use {@link CheckGroupV2.fromId()} instead of instantiating this class directly.
 */
export class CheckGroupRef extends Construct {
  constructor (logicalId: string, physicalId: number) {
    super(CheckGroupV1.__checklyType, logicalId, physicalId, false)
    Session.registerConstruct(this)
  }

  describe (): string {
    return `CheckGroupRef:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)
    await validatePhysicalIdIsNumeric(diagnostics, 'CheckGroupV2', this.physicalId)
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

  allowInChecklyConfig () {
    return true
  }

  synthesize () {
    return null
  }
}
