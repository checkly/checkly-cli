import { CheckConfigDefaults } from '../services/checkly-config-loader.js'
import { CheckGroupV1 } from './check-group-v1.js'
import { Construct } from './construct.js'
import { Diagnostics } from './diagnostics.js'
import { validatePhysicalIdIsNumeric } from './internal/common-diagnostics.js'
import { Session } from './project.js'

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
