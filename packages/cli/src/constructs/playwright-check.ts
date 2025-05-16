import fs from 'fs'
import type { AxiosResponse } from 'axios'
import { Check, CheckProps } from './check'
import { Session } from './project'
import {
  bundlePlayWrightProject, cleanup,
} from '../services/util'
import { checklyStorage } from '../rest/api'
import { ValidationError } from './validator-error'

export interface PlaywrightCheckProps extends CheckProps {
  playwrightConfigPath: string
  codeBundlePath?: string
  installCommand?: string
  testCommand?: string
  pwProjects?: string|string[]
  pwTags?: string|string[]
  browsers?: string[]
  include?: string|string[]
  groupName?: string
  logicalId: string
  cacheHash?: string
}

export class PlaywrightCheck extends Check {
  installCommand?: string
  testCommand: string
  playwrightConfigPath: string
  pwProjects: string[]
  pwTags: string[]
  codeBundlePath?: string
  browsers?: string[]
  include: string[]
  groupName?: string
  name: string
  cacheHash?: string
  constructor (logicalId: string, props: PlaywrightCheckProps) {
    super(logicalId, props)
    this.logicalId = logicalId
    this.name = props.name
    this.cacheHash = props.cacheHash
    this.codeBundlePath = props.codeBundlePath
    this.installCommand = props.installCommand
    this.browsers = props.browsers
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
    if (!fs.existsSync(props.playwrightConfigPath)) {
      throw new ValidationError(`Playwright config doesnt exist ${props.playwrightConfigPath}`)
    }
    this.groupName = props.groupName
    this.playwrightConfigPath = props.playwrightConfigPath
    this.applyGroup(this.groupName)
    Session.registerConstruct(this)
  }

  applyGroup (groupName?: string) {
    if (!groupName) {
      return
    }
    const checkGroups = Session.project?.data?.['check-group']
    if (!checkGroups) {
      return
    }
    const group = Object.values(checkGroups).find(group => group.name === groupName)
    if (group) {
      this.groupId = group.ref()
    } else {
      throw new ValidationError(`Error: No group named "${groupName}". Please verify the group exists in your code or create it.`)
    }
  }

  getSourceFile () {
    return this.__checkFilePath ?? this.logicalId
  }

  static buildTestCommand (
    testCommand: string, playwrightConfigPath: string, playwrightProject?: string[], playwrightTag?: string[],
  ) {
    return `${testCommand} --config ${playwrightConfigPath}${playwrightProject?.length ? ' --project ' + playwrightProject.map(project => `"${project}"`).join(' ') : ''}${playwrightTag?.length ? ' --grep="' + playwrightTag.join('|') + '"' : ''}`
  }

  static async bundleProject (playwrightConfigPath: string, include: string[]) {
    let dir = ''
    try {
      const {
        outputFile, browsers, relativePlaywrightConfigPath, cacheHash,
      } = await bundlePlayWrightProject(playwrightConfigPath, include)
      dir = outputFile
      const { data: { key } } = await PlaywrightCheck.uploadPlaywrightProject(dir)
      return { key, browsers, relativePlaywrightConfigPath, cacheHash }
    } finally {
      await cleanup(dir)
    }
  }

  static async uploadPlaywrightProject (dir: string): Promise<AxiosResponse> {
    const { size } = await fs.promises.stat(dir)
    const stream = fs.createReadStream(dir)
    return checklyStorage.uploadCodeBundle(stream, size)
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
      codeBundlePath: this.codeBundlePath,
      testCommand,
      installCommand: this.installCommand,
      browsers: this.browsers,
    }
  }
}
