import * as path from 'path'
import { existsSync } from 'fs'
import { loadJsFile, loadTsFile, pathToPosix } from './util'
import { CheckProps } from '../constructs/check'
import { Session } from '../constructs'
import { Construct } from '../constructs/construct'
import type { Region } from '..'

export type CheckConfigDefaults = Pick<CheckProps, 'activated' | 'muted' | 'doubleCheck'
  | 'shouldFail' | 'runtimeId' | 'locations' | 'tags' | 'frequency' | 'environmentVariables'
  | 'alertChannels'>

export type ChecklyConfig = {
  /**
   * Friendly name for your project.
   */
  projectName: string,
  /**
   * Unique project identifier.
   */
  logicalId: string,
  /**
   * Git repository URL.
   */
  repoUrl?: string,
  /**
   * Checks default configuration properties.
   */
  checks?: CheckConfigDefaults & {
    /**
     * Glob pattern where the CLI looks for files containing Check constructs, i.e. all `.checks.ts` files
     */
    checkMatch?: string,
    /**
     * List of glob patterns with directories to ignore.
     */
    ignoreDirectoriesMatch?: string[],
    /**
     * Browser checks default configuration properties.
     */
    browserChecks?: CheckConfigDefaults & {
      /**
       * Glob pattern where the CLI looks for Playwright test files, i.e. all `.spec.ts` files
       */
      testMatch?: string,
    },
  },
  /**
   * CLI default configuration properties.
   */
  cli?: {
    runLocation?: keyof Region,
    privateRunLocation?: string,
    verbose?: boolean
  }
}

// eslint-disable-next-line no-restricted-syntax
enum Extension {
  JS = '.js',
  TS = '.ts',
}

function loadFile (file: string) {
  if (!existsSync(file)) {
    return Promise.resolve(null)
  }
  switch (path.extname(file)) {
    case Extension.JS:
      return loadJsFile(file)
    case Extension.TS:
      return loadTsFile(file)
    default:
      throw new Error(`Unsupported file extension ${file} for the config file`)
  }
}

function isString (obj: any) {
  return (Object.prototype.toString.call(obj) === '[object String]')
}

export async function loadChecklyConfig (filename?: string):
  Promise<{ config: ChecklyConfig, constructs: Construct[], projectCwd: string }> {
  const cwd = process.cwd()
  let config
  let projectCwd: string = cwd
  Session.loadingChecklyConfigFile = true
  Session.checklyConfigFileConstructs = []
  const filenames = filename ? [filename] : ['checkly.config.ts', 'checkly.config.js']
  for (const filename of filenames) {
    const file = pathToPosix(path.join(cwd, filename))
    config = await loadFile(file)
    projectCwd = path.dirname(file)
    if (config) {
      break
    }
  }

  if (!config) {
    throw new Error(`Unable to locate a files [${filenames.map(f => path.basename(f)).join(',')}] config at ${projectCwd}`)
  }

  for (const field of ['logicalId', 'projectName']) {
    const requiredField = config?.[field]
    if (!requiredField || !(isString(requiredField))) {
      throw new Error(`Config object missing a ${field} as type string`)
    }
  }

  const constructs = Session.checklyConfigFileConstructs
  Session.loadingChecklyConfigFile = false
  Session.checklyConfigFileConstructs = []
  return { config, constructs, projectCwd }
}
