import { Bundle } from './construct.js'
import { BundlePathMarker, CacheHashMarker, CodeBundleChecksumMarker } from '../services/check-parser/bundler.js'
import { PlaywrightCheck } from './playwright-check.js'
import { Ref } from './ref.js'

export interface PlaywrightCheckBundleProps {
  groupId?: Ref
  codeBundlePath: BundlePathMarker
  codeBundleSha256?: CodeBundleChecksumMarker
  browsers?: string[]
  cacheHash?: CacheHashMarker
  playwrightVersion?: string
  installCommand?: string
  testCommand: string
  workingDir?: string
}

export class PlaywrightCheckBundle implements Bundle {
  playwrightCheck: PlaywrightCheck
  groupId?: Ref
  codeBundlePath: BundlePathMarker
  codeBundleSha256?: CodeBundleChecksumMarker
  browsers?: string[]
  cacheHash?: CacheHashMarker
  playwrightVersion?: string
  installCommand?: string
  testCommand: string
  workingDir?: string

  constructor (playwrightCheck: PlaywrightCheck, props: PlaywrightCheckBundleProps) {
    this.playwrightCheck = playwrightCheck
    this.groupId = props.groupId
    this.codeBundlePath = props.codeBundlePath
    this.codeBundleSha256 = props.codeBundleSha256
    this.browsers = props.browsers
    this.cacheHash = props.cacheHash
    this.playwrightVersion = props.playwrightVersion
    this.installCommand = props.installCommand
    this.testCommand = props.testCommand
    this.workingDir = props.workingDir
  }

  synthesize () {
    return {
      ...this.playwrightCheck.synthesize(),
      groupId: this.groupId,
      codeBundlePath: this.codeBundlePath,
      codeBundleSha256: this.codeBundleSha256,
      browsers: this.browsers,
      cacheHash: this.cacheHash,
      playwrightVersion: this.playwrightVersion,
      installCommand: this.installCommand,
      testCommand: this.testCommand,
      workingDir: this.workingDir,
    }
  }
}
