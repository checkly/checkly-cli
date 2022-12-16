import Check, { CheckProps } from './check'

export interface BrowserCheckProps extends CheckProps {
  script: string
  scriptPath?: string
  dependencies?: Array<string>
}

export interface CheckDependency {
  path: string
  content: string
}

class BrowserCheck extends Check {
  script: string
  scriptPath?: string
  dependencies?: Array<string>

  constructor (logicalId: string, props: BrowserCheckProps) {
    super(logicalId, props)
    this.script = props.script
    this.scriptPath = props.scriptPath
    this.dependencies = props.dependencies
    this.register(Check.__checklyType, this.logicalId, this.synthesize())
    this.addSubscriptions()
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'BROWSER',
      script: this.script,
      scriptPath: this.scriptPath,
      dependencies: this.dependencies,
    }
  }
}

export default BrowserCheck
