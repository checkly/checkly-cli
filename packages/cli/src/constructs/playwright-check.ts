import { Check, CheckProps } from './check'
import { Session } from './project'
import {
  bundlePlayWrightProject, cleanup,
  uploadPlaywrightProject,
} from '../services/util'

export interface PlaywrightCheckProps extends CheckProps {
  codeBundlePath: string
  installCommand?: string
  testCommand?: string
  pwProjects?: string|string[]
  pwTags?: string|string[]
  browsers: string[]
}

export class PlaywrightCheck extends Check {
  private codeBundlePath: string
  private installCommand: string
  private testCommand: string
  private browsers: string[]
  constructor (logicalId: string, props: PlaywrightCheckProps) {
    super(logicalId, props)
    this.codeBundlePath = props.codeBundlePath
    this.installCommand = props.installCommand ?? 'npm install --only=dev'
    this.browsers = props.browsers
    const playplaywrightProject = props.pwProjects
      ? (Array.isArray(props.pwProjects) ? props.pwProjects : [props.pwProjects])
      : []
    const playwrightTag = props.pwTags
      ? (Array.isArray(props.pwTags) ? props.pwTags : [props.pwTags])
      : []
    this.testCommand = PlaywrightCheck.buildTestCommand(props.testCommand ?? 'npx playwright test', playplaywrightProject, playwrightTag)
    Session.registerConstruct(this)
  }

  getSourceFile () {
    return this.__checkFilePath ?? this.logicalId
  }

  static buildTestCommand (testCommand: string, playwrightProject?: string[], playwrightTag?: string[]) {
    return `${testCommand}${playwrightProject?.length ? ' --project="' + playwrightProject.join(',') + '"' : ''}${playwrightTag?.length ? ' --grep="' + playwrightTag.join('|') + '"' : ''}`
  }

  static async bundleProject (playwrightConfigPath: string) {
    let dir = ''
    try {
      const { outputFile, browsers } = await bundlePlayWrightProject(playwrightConfigPath)
      dir = outputFile
      const { data: { key } } = await uploadPlaywrightProject(dir)
      return { key, browsers }
    } finally {
      await cleanup(dir)
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'PLAYWRIGHT',
      codeBundlePath: this.codeBundlePath,
      testCommand: this.testCommand,
      installCommand: this.installCommand,
      browsers: this.browsers,
    }
  }
}
