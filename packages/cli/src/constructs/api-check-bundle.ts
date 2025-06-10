import { ScriptDependency, ApiCheck } from './api-check'
import { Bundle } from './construct'

export interface ApiCheckBundleProps {
  localSetupScript?: string
  setupScriptPath?: string
  setupScriptDependencies?: ScriptDependency[]
  localTearDownScript?: string
  tearDownScriptPath?: string
  tearDownScriptDependencies?: ScriptDependency[]
}

export class ApiCheckBundle implements Bundle {
  apiCheck: ApiCheck
  localSetupScript?: string
  setupScriptPath?: string
  setupScriptDependencies?: ScriptDependency[]
  localTearDownScript?: string
  tearDownScriptPath?: string
  tearDownScriptDependencies?: ScriptDependency[]

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
