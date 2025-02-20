import { Check, CheckProps } from './check'
import { Session } from './project'

export interface PlaywrightCheckProps extends CheckProps {
  codePath: string
}

export class PlayWrightCheck extends Check {
  private codePath: string
  constructor (logicalId: string, props: PlaywrightCheckProps) {
    super(logicalId, props)
    this.codePath = props.codePath
    Session.registerConstruct(this)
  }

  getSourceFile () {
    return this.__checkFilePath ?? this.logicalId
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'PLAYWRIGHT',
      codePath: this.codePath,
    }
  }
}
