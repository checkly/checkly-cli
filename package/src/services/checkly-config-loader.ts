import * as path from 'path'
import { existsSync } from 'fs'
import { loadJsFile, loadTsFile } from './util'
import { CheckProps } from '../constructs/check'
import { Session } from '../constructs'
import type { Construct } from '../constructs/construct'

// TODO: How would a user declare default alert channels?
// We need some additional work before constructs can be created in checkly.config.js.
// alertChannels?: Array<AlertChannel>,
export type CheckConfigDefaults = Pick<CheckProps, 'activated' | 'muted' | 'doubleCheck'
  | 'shouldFail' | 'runtimeId' | 'locations' | 'tags' | 'frequency' | 'environmentVariables'>

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
  Session.checklyConfigConstructs = []
  // TODO: Add proper error messages for missing config fields
  let config
  if (existsSync(path.join(dir, 'checkly.config.js'))) {
    config = await loadJsFile(path.join(dir, 'checkly.config.js'))
  } else if (existsSync(path.join(dir, 'checkly.config.ts'))) {
    config = await loadTsFile(path.join(dir, 'checkly.config.ts'))
  } else {
    throw new Error('Unable to find checkly.config.js or checkly.config.ts in the current directory.')
  }
  const constructs = Session.checklyConfigConstructs
  // Overwrite `Session.checklyConfigConstructs` since the checkly cofnig is now parsed
  Session.checklyConfigConstructs = undefined 
  return { config, constructs }
}
