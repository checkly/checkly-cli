import { Bundle } from './construct.js'
import { MultiStepCheck } from './multi-step-check.js'
import { SharedFileRef } from './session.js'

export interface MultiStepCheckBundleProps {
  script: string
  scriptPath?: string
  dependencies?: SharedFileRef[]
}

export class MultiStepCheckBundle implements Bundle {
  multiStepCheck: MultiStepCheck
  script: string
  scriptPath?: string
  dependencies?: SharedFileRef[]

  constructor (multiStepCheck: MultiStepCheck, props: MultiStepCheckBundleProps) {
    this.multiStepCheck = multiStepCheck
    this.script = props.script
    this.scriptPath = props.scriptPath
    this.dependencies = props.dependencies
  }

  synthesize () {
    return {
      ...this.multiStepCheck.synthesize(),
      script: this.script,
      scriptPath: this.scriptPath,
      dependencies: this.dependencies,
    }
  }
}
