import * as path from 'path'
import { existsSync } from 'fs'
import { loadFile } from './util'
import { CheckProps } from '../constructs/check'
import { Session } from '../constructs'
import { Construct } from '../constructs/construct'
import type { Region } from '..'
import { ReporterType } from '../reporters/reporter'
import * as fs from 'fs'
import { PlaywrightConfig } from '../constructs/playwright-config'

export type CheckConfigDefaults = Pick<CheckProps, 'activated' | 'muted' | 'doubleCheck'
  | 'shouldFail' | 'runtimeId' | 'locations' | 'tags' | 'frequency' | 'environmentVariables'
  | 'alertChannels' | 'privateLocations' | 'retryStrategy' | 'alertEscalationPolicy'>

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
    checkMatch?: string | string[],
    /**
     * List of glob patterns with directories to ignore.
     */
    ignoreDirectoriesMatch?: string[],

    playwrightConfig?: PlaywrightConfig,

    /**
     * Browser checks default configuration properties.
     */
    browserChecks?: CheckConfigDefaults & {
      /**
       * Glob pattern where the CLI looks for Playwright test files, i.e. all `.spec.ts` files
       */
      testMatch?: string | string[],
    },
    /**
     * Multistep checks default configuration properties.
     */
    multiStepChecks?: CheckConfigDefaults & {
      /**
       * Glob pattern where the CLI looks for Playwright test files, i.e. all `.spec.ts` files
       */
      testMatch?: string | string[],
    },
  },
  /**
   * CLI default configuration properties.
   */
  cli?: {
    runLocation?: keyof Region,
    privateRunLocation?: string,
    verbose?: boolean,
    failOnNoMatching?: boolean,
    reporters?: ReporterType[],
    retries?: number,
  }
}

function isString (obj: any) {
  return (Object.prototype.toString.call(obj) === '[object String]')
}

export function getChecklyConfigFile (): {checklyConfig: string, fileName: string} | undefined {
  const filenames = [
    'checkly.config.ts',
    'checkly.config.mts',
    'checkly.config.cts',
    'checkly.config.js',
    'checkly.config.mjs',
    'checkly.config.cjs',
  ]
  let config
  for (const configFile of filenames) {
    const dir = path.resolve(path.dirname(configFile))
    if (!existsSync(path.resolve(dir, configFile))) {
      continue
    }
    const file = fs.readFileSync(path.resolve(dir, configFile))
    if (file) {
      config = {
        checklyConfig: file.toString(),
        fileName: configFile,
      }
      break
    }
  }
  return config
}

export class ConfigNotFoundError extends Error {}

export async function loadChecklyConfig (dir: string, filenames = ['checkly.config.ts', 'checkly.config.mts', 'checkly.config.cts', 'checkly.config.js', 'checkly.config.mjs', 'checkly.config.cjs']): Promise<{ config: ChecklyConfig, constructs: Construct[] }> {
  let config
  Session.loadingChecklyConfigFile = true
  Session.checklyConfigFileConstructs = []
  for (const filename of filenames) {
    const filePath = path.join(dir, filename)
    if (existsSync(filePath)) {
      config = await loadFile(filePath)
      break
    }
  }

  if (!config) {
    throw new ConfigNotFoundError(`Unable to locate a config at ${dir} with ${filenames.join(', ')}.`)
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
  return { config, constructs }
}
