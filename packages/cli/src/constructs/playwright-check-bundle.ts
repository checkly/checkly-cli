import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'

import { AxiosResponse } from 'axios'

import { Bundle } from './construct'
import { PlaywrightCheck } from './playwright-check'
import { Ref } from './ref'
import { checklyStorage } from '../rest/api'

export interface PlaywrightCheckLocalBundleProps {
  groupId?: Ref
  localCodeBundlePath: string
  browsers?: string[]
  cacheHash?: string
  playwrightVersion?: string
  installCommand?: string
  testCommand: string
  workingDir?: string
}

export class PlaywrightCheckLocalBundle implements Bundle {
  playwrightCheck: PlaywrightCheck
  groupId?: Ref
  localCodeBundlePath: string
  browsers?: string[]
  cacheHash?: string
  playwrightVersion?: string
  installCommand?: string
  testCommand: string
  workingDir?: string

  constructor (playwrightCheck: PlaywrightCheck, props: PlaywrightCheckLocalBundleProps) {
    this.playwrightCheck = playwrightCheck
    this.groupId = props.groupId
    this.localCodeBundlePath = props.localCodeBundlePath
    this.browsers = props.browsers
    this.cacheHash = props.cacheHash
    this.playwrightVersion = props.playwrightVersion
    this.installCommand = props.installCommand
    this.testCommand = props.testCommand
    this.workingDir = props.workingDir
  }

  async store (): Promise<PlaywrightCheckStoredBundle> {
    const {
      data: {
        key: codeBundlePath,
      },
    } = await this.#uploadCodeBundle(this.localCodeBundlePath)

    return new PlaywrightCheckStoredBundle(this.playwrightCheck, {
      groupId: this.groupId,
      localCodeBundlePath: this.localCodeBundlePath,
      codeBundlePath,
      browsers: this.browsers,
      cacheHash: this.cacheHash,
      playwrightVersion: this.playwrightVersion,
      testCommand: this.testCommand,
      installCommand: this.installCommand,
      workingDir: this.workingDir,
    })
  }

  async #uploadCodeBundle (filePath: string): Promise<AxiosResponse> {
    const { size } = await fs.stat(filePath)
    const stream = createReadStream(filePath)
    stream.on('error', err => {
      throw new Error(`Failed to read Playwright project file: ${err.message}`)
    })
    return checklyStorage.uploadCodeBundle(stream, size)
  }

  synthesize () {
    return {
      ...this.playwrightCheck.synthesize(),
      groupId: this.groupId,
      codeBundlePath: this.localCodeBundlePath,
      browsers: this.browsers,
      cacheHash: this.cacheHash,
      playwrightVersion: this.playwrightVersion,
      installCommand: this.installCommand,
      testCommand: this.testCommand,
      workingDir: this.workingDir,
    }
  }
}

export interface PlaywrightCheckStoredBundleProps extends PlaywrightCheckLocalBundleProps {
  codeBundlePath: string
}

export class PlaywrightCheckStoredBundle extends PlaywrightCheckLocalBundle {
  codeBundlePath: string

  constructor (playwrightCheck: PlaywrightCheck, props: PlaywrightCheckStoredBundleProps) {
    super(playwrightCheck, props)
    this.codeBundlePath = props.codeBundlePath
  }

  synthesize () {
    return {
      ...super.synthesize(),
      codeBundlePath: this.codeBundlePath,
    }
  }
}
