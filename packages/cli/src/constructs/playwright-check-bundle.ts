import { Bundle } from './construct'
import { PlaywrightCheck } from './playwright-check'
import { Ref } from './ref'

export interface PlaywrightCheckBundleProps {
  groupId?: Ref
  codeBundlePath?: string
  browsers?: string[]
  cacheHash?: string
  playwrightVersion?: string
}

export class PlaywrightCheckBundle implements Bundle {
  playwrightCheck: PlaywrightCheck
  groupId?: Ref
  codeBundlePath?: string
  browsers?: string[]
  cacheHash?: string
  playwrightVersion?: string

  constructor (playwrightCheck: PlaywrightCheck, props: PlaywrightCheckBundleProps) {
    this.playwrightCheck = playwrightCheck
    this.groupId = props.groupId
    this.codeBundlePath = props.codeBundlePath
    this.browsers = props.browsers
    this.cacheHash = props.cacheHash
    this.playwrightVersion = props.playwrightVersion
  }

  synthesize () {
    return {
      ...this.playwrightCheck.synthesize(),
      groupId: this.groupId,
      codeBundlePath: this.codeBundlePath,
      browsers: this.browsers,
      cacheHash: this.cacheHash,
      playwrightVersion: this.playwrightVersion
    }
  }
}
