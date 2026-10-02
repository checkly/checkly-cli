import { RawSnapshot, Snapshot } from '../services/snapshot-service.js'
import { BrowserCheck } from './browser-check.js'
import { Bundle } from './construct.js'
import { SharedFileRef } from './session.js'

export interface BrowserCheckBundleProps {
  script: string
  scriptPath?: string
  dependencies?: SharedFileRef[]
  rawSnapshots?: RawSnapshot[]
}

export class BrowserCheckBundle implements Bundle {
  browserCheck: BrowserCheck
  script: string
  scriptPath?: string
  dependencies?: SharedFileRef[]
  // For snapshots, we first store `rawSnapshots` with the path to the file.
  // The `snapshots` field is set later (with a `key`) after these are uploaded to storage.
  rawSnapshots?: RawSnapshot[]
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
      // Until the upload has run there is no storage key, but the content hash
      // is already known, and that is what a deploy preview compares. Checkly
      // requires the key on every route that writes or runs a check, so a
      // key-less entry can only ever reach the preview.
      snapshots: this.snapshots ?? this.rawSnapshots?.map(({ path, sha256 }) => ({ path, sha256 })),
    }
  }
}
