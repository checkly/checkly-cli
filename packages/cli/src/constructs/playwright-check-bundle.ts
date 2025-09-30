import { Bundle } from './construct'
import { PlaywrightCheck } from './playwright-check'
import { Ref } from './ref'

export interface PlaywrightCheckBundleProps {
  group?: Ref
  codeBundlePath?: string
  browsers?: string[]
  cacheHash?: string
  playwrightVersion?: string
  installCommand?: string
  testCommand: string
}

export class PlaywrightCheckBundle implements Bundle {
  playwrightCheck: PlaywrightCheck
  group?: Ref
  codeBundlePath?: string
  browsers?: string[]
  cacheHash?: string
  playwrightVersion?: string
  installCommand?: string
  testCommand: string

  constructor (playwrightCheck: PlaywrightCheck, props: PlaywrightCheckBundleProps) {
    this.playwrightCheck = playwrightCheck
    this.group = props.group
    this.codeBundlePath = props.codeBundlePath
    this.browsers = props.browsers
    this.cacheHash = props.cacheHash
    this.playwrightVersion = props.playwrightVersion
    this.installCommand = props.installCommand
    this.testCommand = props.testCommand
  }

  synthesize () {
    return {
      ...this.playwrightCheck.synthesize(),
      groupId: this.group,
      codeBundlePath: this.codeBundlePath,
      browsers: this.browsers,
      cacheHash: this.cacheHash,
      playwrightVersion: this.playwrightVersion,
      installCommand: this.installCommand,
      testCommand: this.testCommand,
    }
  }
}
