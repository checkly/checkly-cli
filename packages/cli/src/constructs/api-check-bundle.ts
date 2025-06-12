import { ApiCheck } from './api-check'
import { Bundle } from './construct'
import { SharedFileRef } from './project'

export interface ApiCheckBundleProps {
  localSetupScript?: string
  setupScriptPath?: string
  setupScriptDependencies?: SharedFileRef[]
  localTearDownScript?: string
  tearDownScriptPath?: string
  tearDownScriptDependencies?: SharedFileRef[]
}

export class ApiCheckBundle implements Bundle {
  apiCheck: ApiCheck
  localSetupScript?: string
  setupScriptPath?: string
  setupScriptDependencies?: SharedFileRef[]
  localTearDownScript?: string
  tearDownScriptPath?: string
  tearDownScriptDependencies?: SharedFileRef[]

  constructor (apiCheck: ApiCheck, props: ApiCheckBundleProps) {
    this.apiCheck = apiCheck
    this.localSetupScript = props.localSetupScript
    this.setupScriptPath = props.setupScriptPath
    this.setupScriptDependencies = props.setupScriptDependencies
    this.localTearDownScript = props.localTearDownScript
    this.tearDownScriptPath = props.tearDownScriptPath
    this.tearDownScriptDependencies = props.tearDownScriptDependencies
  }

  synthesize () {
    return {
      ...this.apiCheck.synthesize(),
      localSetupScript: this.localSetupScript,
      setupScriptPath: this.setupScriptPath,
      setupScriptDependencies: this.setupScriptDependencies,
      localTearDownScript: this.localTearDownScript,
      tearDownScriptPath: this.tearDownScriptPath,
      tearDownScriptDependencies: this.tearDownScriptDependencies,
    }
  }
}
