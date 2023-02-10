import * as path from 'path'
import { existsSync } from 'fs'
import { loadJsFile, loadTsFile } from './util'
import { CheckProps } from '../constructs/check'
import { Session, Construct } from '../internal-constructs'

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
  repoUrl: string,
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
  }
}

export async function loadChecklyConfig (dir: string): Promise<{ config: ChecklyConfig, constructs: Construct[] }> {
  let config
  Session.loadingChecklyConfigFile = true
  Session.checklyConfigFileConstructs = []
  if (existsSync(path.join(dir, 'checkly.config.js'))) {
    config = await loadJsFile(path.join(dir, 'checkly.config.js'))
  } else if (existsSync(path.join(dir, 'checkly.config.ts'))) {
    config = await loadTsFile(path.join(dir, 'checkly.config.ts'))
  } else {
    throw new Error('Unable to find checkly.config.js or checkly.config.ts in the current directory.')
  }
  const constructs = Session.checklyConfigFileConstructs
  Session.loadingChecklyConfigFile = false
  Session.checklyConfigFileConstructs = []
  return { config, constructs }
}
