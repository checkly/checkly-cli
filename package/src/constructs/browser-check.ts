import * as fs from 'fs'
import * as path from 'path'
import { Check, CheckProps } from './check'
import { Session } from './project'
import { parseDependencies } from '../services/check-dependency-parser'

export interface CheckDependency {
  path: string
  content: string
}

export interface Entrypoint {
  entrypoint: string
}

export interface Content {
  content: string
}

export interface BrowserCheckProps extends CheckProps {
  code: Content|Entrypoint
}

export class BrowserCheck extends Check {
  script: string
  scriptPath?: string
  dependencies?: Array<CheckDependency>

  constructor (logicalId: string, props: BrowserCheckProps) {
    super(logicalId, props)
    if ('content' in props.code) {
      const script = props.code.content
      this.script = script
    } else if ('entrypoint' in props.code) {
      const entrypoint = props.code.entrypoint
      const bundle = BrowserCheck.bundle(entrypoint)
      this.script = bundle.script
      this.scriptPath = bundle.scriptPath
      this.dependencies = bundle.dependencies
    } else {
      throw new Error('Unrecognized type for the code property')
    }
    this.register(Check.__checklyType, this.logicalId, this.synthesize())
    this.addSubscriptions()
  }

  static bundle (entry: string) {
    // TODO: We need pass the runtimeId somehow
    const parsed = parseDependencies(entry)
    // Maybe we can get the parsed deps with the content immediately
    const content = fs.readFileSync(entry, { encoding: 'utf8' })

    const deps: CheckDependency[] = []
    for (const dep of parsed) {
      const content = fs.readFileSync(entry, { encoding: 'utf8' })
      deps.push({
        path: path.relative(Session.basePath, dep),
        content,
      })
    }
    return {
      script: content,
      scriptPath: path.relative(Session.basePath, entry),
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
