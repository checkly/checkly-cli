import * as path from 'path'
import { existsSync } from 'fs'
import { loadJsFile, loadTsFile } from './util'
import { CheckProps } from '../constructs/check'
import { Session } from '../constructs'
import { Construct } from '../constructs/construct'

export type CheckConfigDefaults = Pick<CheckProps, 'activated' | 'muted' | 'doubleCheck'
  | 'shouldFail' | 'runtimeId' | 'locations' | 'tags' | 'frequency' | 'environmentVariables'
  | 'alertChannels'>

export type ChecklyConfig = {
  /**
   * Friendly name for your project.
   */
  projectName: string,
  /**
   * Unique project indentifier.
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
     * Glob pattern to where Checkly looks for checks.
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
       * Glob pattern to include multiple files, i.e. all `.spec.js` files
       */
      testMatch?: string,
    },
  },
  /**
   * CLI default configuration properties.
   */
  cli?: {
    runLocation?: string,
    privateRunLocation?: string,
    verbose?: boolean
  }
}

enum Extension {
  JS = '.js',
  TS = '.ts'

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

export async function loadChecklyConfig (dir: string, filenames = ['checkly.config.ts', 'checkly.config.js']): Promise<{ config: ChecklyConfig, constructs: Construct[] }> {
  let config
  Session.loadingChecklyConfigFile = true
  Session.checklyConfigFileConstructs = []
  for (const filename of filenames) {
    config = await loadFile(path.join(dir, filename))
    if (config) {
      break
    }
  }

  if (!config) {
    throw new Error(`Unable to locate a config at ${dir} with ${filenames.join(', ')}.`)
  }

  for (const field of ['logicalId', 'projectName']) {
    const requiredField = config?.[field]
    if (!requiredField || !(requiredField instanceof String)) {
      throw new Error(`Config object missing a ${field} as type string`)
    }
  }

  const constructs = Session.checklyConfigFileConstructs
  Session.loadingChecklyConfigFile = false
  Session.checklyConfigFileConstructs = []
  return { config, constructs }
}
