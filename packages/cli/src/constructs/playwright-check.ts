import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'

import type { AxiosResponse } from 'axios'
import { RuntimeCheck, RuntimeCheckProps } from './check'
import { Session } from './project'
import {
  bundlePlayWrightProject, cleanup,
} from '../services/util'
import { checklyStorage } from '../rest/api'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'
import { PlaywrightCheckBundle } from './playwright-check-bundle'
import { Ref } from './ref'

export interface PlaywrightCheckProps extends RuntimeCheckProps {
  playwrightConfigPath: string
  installCommand?: string
  testCommand?: string
  pwProjects?: string|string[]
  pwTags?: string|string[]
  include?: string|string[]
  groupName?: string
}

export class PlaywrightCheck extends RuntimeCheck {
  installCommand?: string
  testCommand: string
  playwrightConfigPath: string
  pwProjects: string[]
  pwTags: string[]
  include: string[]
  groupName?: string

  constructor (logicalId: string, props: PlaywrightCheckProps) {
    super(logicalId, props)
    this.installCommand = props.installCommand
    this.pwProjects = props.pwProjects
      ? (Array.isArray(props.pwProjects) ? props.pwProjects : [props.pwProjects])
      : []
    this.pwTags = props.pwTags
      ? (Array.isArray(props.pwTags) ? props.pwTags : [props.pwTags])
      : []
    this.include = props.include
      ? (Array.isArray(props.include) ? props.include : [props.include])
      : []
    this.testCommand = props.testCommand ?? 'npx playwright test'
    this.groupName = props.groupName
    this.playwrightConfigPath = props.playwrightConfigPath
    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `PlaywrightCheck:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    try {
      await fs.access(this.playwrightConfigPath, fs.constants.R_OK)
    } catch (err: any) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'playwrightConfigPath',
        new Error(`Playwright config "${this.playwrightConfigPath}" does not exist: ${err.message}`, { cause: err }),
      ))
    }

    if (this.groupName) {
      const checkGroup = this.#findGroupByName(this.groupName)
      if (!checkGroup) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'groupName',
          new Error(`No such group "${this.groupName}".`),
        ))
      }
    }
  }

  #findGroupByName (groupName: string) {
    return Object.values(Session.project?.data?.['check-group'] ?? {})
      .find(group => group.name === groupName)
  }

  getSourceFile () {
    return this.__checkFilePath
  }

  static buildTestCommand (
    testCommand: string, playwrightConfigPath: string, playwrightProject?: string[], playwrightTag?: string[],
  ) {
    const quotedPath = `"${playwrightConfigPath}"`
    const projectArg = playwrightProject?.length ? ' --project ' + playwrightProject.map(p => `"${p}"`).join(' ') : ''
    const tagArg = playwrightTag?.length ? ' --grep "' + playwrightTag.join('|').replace(/"/g, '\\"') + '"' : ''
    return `${testCommand} --config ${quotedPath}${projectArg}${tagArg}`
  }

  static async bundleProject (playwrightConfigPath: string, include: string[]) {
    let dir = ''
    try {
      const {
        outputFile, browsers, relativePlaywrightConfigPath, cacheHash, playwrightVersion
      } = await bundlePlayWrightProject(playwrightConfigPath, include)
      dir = outputFile
      const { data: { key } } = await PlaywrightCheck.uploadPlaywrightProject(dir)
      return { key, browsers, relativePlaywrightConfigPath, cacheHash, playwrightVersion }
    } finally {
      await cleanup(dir)
    }
  }

  static async uploadPlaywrightProject (dir: string): Promise<AxiosResponse> {
    const { size } = await fs.stat(dir)
    const stream = createReadStream(dir)
    stream.on('error', (err) => {
         throw new Error(`Failed to read Playwright project file: ${err.message}`)
    })
    return checklyStorage.uploadCodeBundle(stream, size)
  }

  async bundle (): Promise<PlaywrightCheckBundle> {
    let groupId: Ref | undefined
    if (this.groupName) {
      const checkGroup = this.#findGroupByName(this.groupName)
      if (checkGroup) {
        groupId = checkGroup.ref()
      }
    }

    const {
      key: codeBundlePath,
      browsers,
      cacheHash,
      playwrightVersion,
    } = await PlaywrightCheck.bundleProject(this.playwrightConfigPath, this.include ?? [])

    return new PlaywrightCheckBundle(this, {
      groupId,
      codeBundlePath,
      browsers,
      cacheHash,
      playwrightVersion,
    })
  }

  synthesize () {
    const testCommand = PlaywrightCheck.buildTestCommand(
      this.testCommand,
      this.playwrightConfigPath,
      this.pwProjects,
      this.pwTags,
    )
    return {
      ...super.synthesize(),
      checkType: 'PLAYWRIGHT',
      testCommand,
      installCommand: this.installCommand,
    }
  }
}
