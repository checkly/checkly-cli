import { Check, CheckProps } from './check'
import { Session } from './project'
import {
  bundlePlayWrightProject, cleanup,
  uploadPlaywrightProject,
} from '../services/util'

export interface PlaywrightCheckProps extends CheckProps {
  codeBundlePath: string
}

export class PlaywrightCheck extends Check {
  private codeBundlePath: string
  constructor (logicalId: string, props: PlaywrightCheckProps) {
    super(logicalId, props)
    this.codeBundlePath = props.codeBundlePath
    Session.registerConstruct(this)
  }

  getSourceFile () {
    return this.__checkFilePath ?? this.logicalId
  }

  static async bundleProject (playwrightConfigPath: string) {
    let dir = ''
    try {
      dir = await bundlePlayWrightProject(playwrightConfigPath)
      const { data: { key } } = await uploadPlaywrightProject(dir)
      return key
    } finally {
      await cleanup(dir)
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'PLAYWRIGHT',
      codeBundlePath: this.codeBundlePath,
    }
  }
}
