import { Construct } from './construct'
import { Session } from './project'
import { ValidationError } from './validator-error'

export interface PrivateLocationProps {
  /**
   * The name assigned to the private location.
   */
  name: string
  /**
   * A valid slug name.
   */
  slugName: string
}

class PrivateLocationWrapper extends Construct {
  constructor (logicalId: string, physicalId: string|number) {
    super(PrivateLocation.__checklyType, logicalId, physicalId, false)
    Session.registerConstruct(this)
  }

  synthesize () {
    return null
  }
}

/**
 * Creates an Private Location
 *
 * @remarks
 *
 * This class make use of the Private Location endpoints.
 */
export class PrivateLocation extends Construct {
  name: string
  slugName: string

  static readonly __checklyType = 'private-location'

  /**
   * Constructs the Private Location instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props private location configuration properties
   */
  constructor (logicalId: string, props: PrivateLocationProps) {
    super(PrivateLocation.__checklyType, logicalId)
    this.name = props.name
    this.slugName = props.slugName

    if (!/^((?!((us(-gov)?|ap|ca|cn|eu|sa|af|me)-(central|(north|south)?(east|west)?)-\d+))[a-zA-Z0-9-]{1,30})$/
      .test(this.slugName)) {
      throw new ValidationError(`The "slugName" must differ from all AWS locations. (slugName='${this.slugName}')`)
    }

    Session.registerConstruct(this)
  }

  static fromId (id: string|number) {
    return new PrivateLocationWrapper(`private-location-${id}`, id)
  }

  allowInChecklyConfig () {
    return true
  }

  synthesize (): any|null {
    return {
      name: this.name,
      slugName: this.slugName,
    }
  }
}
