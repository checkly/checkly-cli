import { Check, CheckProps } from './check'
import { Session } from './project'

export interface PlaywrightCheckProps extends CheckProps {
  source: string
}

export class PlayWrightCheck extends Check {
  private source: string
  constructor (logicalId: string, props: PlaywrightCheckProps) {
    super(logicalId, props)
    this.source = props.source
    Session.registerConstruct(this)
  }

  getSourceFile () {
    return this.__checkFilePath ?? this.logicalId
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'PLAYWRIGHT',
      source: this.source,
    }
  }
}
