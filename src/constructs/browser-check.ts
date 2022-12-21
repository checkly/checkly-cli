import * as fs from 'fs/promises'
import { Check, CheckProps } from './check'
import { parseDependencies } from '../services/check-dependency-parser'

export interface CheckDependency {
  path: string
  content: string
}

export interface Bundle {
  script: string
  scriptPath: string
  dependencies: Array<CheckDependency>
}

export interface BrowserCheckProps extends CheckProps {
  code: string|Bundle
}

export class BrowserCheck extends Check {
  script: string
  scriptPath?: string
  dependencies?: Array<CheckDependency>

  constructor (logicalId: string, props: BrowserCheckProps) {
    super(logicalId, props)
    if (props.code instanceof String) {
      const script = props.code as string
      this.script = script
    } else {
      const bundle = props.code as Bundle
      this.script = bundle.script
      this.scriptPath = bundle.scriptPath
      this.dependencies = bundle.dependencies
    }
    this.register(Check.__checklyType, this.logicalId, this.synthesize())
    this.addSubscriptions()
  }

  static async bundle (entry: string): Promise<Bundle> {
    // TODO: We need pass the runtimeId somehow
    const parsed = await parseDependencies(entry)
    // Maybe we can get the parsed deps with the content immediately
    const content = await fs.readFile(entry, { encoding: 'utf8' })

    const deps: CheckDependency[] = []
    for (const dep of parsed) {
      const content = await fs.readFile(entry, { encoding: 'utf8' })
      deps.push({
        path: dep,
        content,
      })
    }
    return {
      script: content,
      scriptPath: entry,
      dependencies: deps,
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'BROWSER',
      script: this.script,
      scriptPath: this.scriptPath,
      dependencies: this.dependencies,
    }
  }
}
