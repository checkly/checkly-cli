import * as fs from 'fs'
import * as path from 'path'
import { Check, CheckProps } from './check'
import { Session } from './project'
import { Parser } from '../services/check-dependency-parser'
import { CheckConfigDefaults } from '../services/checkly-config-loader'

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
    BrowserCheck.applyDefaultBrowserCheckConfig(props)
    super(logicalId, props)
    if ('content' in props.code) {
      const script = props.code.content
      this.script = script
    } else if ('entrypoint' in props.code) {
      const entrypoint = props.code.entrypoint
      let absoluteEntrypoint = null
      if (path.isAbsolute(entrypoint)) {
        absoluteEntrypoint = entrypoint
      } else {
        if (!this.__checkFilePath) {
          throw new Error('You cant use relative paths without the __checkFilePath')
        }
        absoluteEntrypoint = path.join(path.dirname(this.__checkFilePath), entrypoint)
      }
      // runtimeId will always be set by check or browser check defaults so it is safe to use ! operator
      const bundle = BrowserCheck.bundle(absoluteEntrypoint, this.runtimeId!)
      this.script = bundle.script
      this.scriptPath = bundle.scriptPath
      this.dependencies = bundle.dependencies
    } else {
      throw new Error('Unrecognized type for the code property')
    }
    this.register(Check.__checklyType, this.logicalId, this.synthesize())
    this.addSubscriptions()
  }

  private static applyDefaultBrowserCheckConfig (props: CheckConfigDefaults) {
    if (!Session.browserCheckDefaults) {
      return
    }
    let configKey: keyof CheckConfigDefaults
    for (configKey in Session.browserCheckDefaults) {
      const newVal: any = props[configKey] ?? Session.browserCheckDefaults[configKey]
      props[configKey] = newVal
    }
  }

  static bundle (entry: string, runtimeId: string) {
    const runtime = Session.availableRuntimes[runtimeId]
    if (!runtime) {
      throw new Error(`${runtimeId} is not supported`)
    }
    const parser = new Parser(Object.keys(runtime.dependencies))
    const parsed = parser.parseDependencies(entry)
    // Maybe we can get the parsed deps with the content immediately
    const content = fs.readFileSync(entry, { encoding: 'utf8' })

    const deps: CheckDependency[] = []
    for (const dep of parsed) {
      const content = fs.readFileSync(dep, { encoding: 'utf8' })
      deps.push({
        path: path.relative(Session.basePath!, dep),
        content,
      })
    }
    return {
      script: content,
      scriptPath: path.relative(Session.basePath!, entry),
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
      sourceFile: this.__checkFilePath ?? this.scriptPath,
    }
  }
}
