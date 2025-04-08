import fs from 'fs'
import { Check, CheckProps } from './check'
import { Session } from './project'
import {
  bundlePlayWrightProject, cleanup,
  uploadPlaywrightProject,
} from '../services/util'
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
}

export class PlaywrightCheck extends Check {
  installCommand: string
  testCommand: string
  playwrightConfigPath: string
  pwProjects: string[]
  pwTags: string[]
  codeBundlePath?: string
  browsers?: string[]
  include: string[]
  constructor (logicalId: string, props: PlaywrightCheckProps) {
    super(logicalId, props)
    this.codeBundlePath = props.codeBundlePath
    this.installCommand = props.installCommand ?? 'npm install --only=dev'
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
    this.playwrightConfigPath = props.playwrightConfigPath
    Session.registerConstruct(this)
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
        outputFile, browsers, relativePlaywrightConfigPath,
      } = await bundlePlayWrightProject(playwrightConfigPath, include)
      dir = outputFile
      const { data: { key } } = await uploadPlaywrightProject(dir)
      return { key, browsers, relativePlaywrightConfigPath }
    } finally {
      await cleanup(dir)
    }
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
