import { Check, CheckProps } from './check'
import { Session } from './project'

export interface PlaywrightCheckProps extends CheckProps {
  codeBundlePath: string
}

export class PlayWrightCheck extends Check {
  private codeBundlePath: string
  constructor (logicalId: string, props: PlaywrightCheckProps) {
    super(logicalId, props)
    this.codeBundlePath = props.codeBundlePath
    Session.registerConstruct(this)
  }

  getSourceFile () {
    return this.__checkFilePath ?? this.logicalId
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'PLAYWRIGHT',
      codeBundlePath: this.codeBundlePath,
    }
  }
}
