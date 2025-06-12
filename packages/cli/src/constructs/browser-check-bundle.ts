import { Snapshot } from '../services/snapshot-service'
import { BrowserCheck } from './browser-check'
import { Bundle } from './construct'
import { SharedFileRef } from './project'

export interface BrowserCheckBundleProps {
  script: string
  scriptPath?: string
  dependencies?: SharedFileRef[]
  rawSnapshots?: { absolutePath: string, path: string }[]
}

export class BrowserCheckBundle implements Bundle {
  browserCheck: BrowserCheck
  script: string
  scriptPath?: string
  dependencies?: SharedFileRef[]
  // For snapshots, we first store `rawSnapshots` with the path to the file.
  // The `snapshots` field is set later (with a `key`) after these are uploaded to storage.
  rawSnapshots?: { absolutePath: string, path: string }[]
  snapshots?: Snapshot[]

  constructor (browserCheck: BrowserCheck, props: BrowserCheckBundleProps) {
    this.browserCheck = browserCheck
    this.script = props.script
    this.scriptPath = props.scriptPath
    this.dependencies = props.dependencies
    this.rawSnapshots = props.rawSnapshots
  }

  synthesize () {
    return {
      ...this.browserCheck.synthesize(),
      script: this.script,
      scriptPath: this.scriptPath,
      dependencies: this.dependencies,
      snapshots: this.snapshots,
    }
  }
}
