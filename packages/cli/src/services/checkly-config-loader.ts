import * as path from 'path'
import { existsSync } from 'fs'
import { getDefaultChecklyConfig, loadJsFile, loadTsFile, writeChecklyConfigFile } from './util'
import { CheckProps } from '../constructs/check'
import { PlaywrightCheckProps } from '../constructs/playwright-check'

import { Session } from '../constructs'
import { Construct } from '../constructs/construct'
import type { Region } from '..'
import { ReporterType } from '../reporters/reporter'
import * as fs from 'fs'
import { PlaywrightConfig } from '../constructs/playwright-config'

export type CheckConfigDefaults = Pick<CheckProps, 'activated' | 'muted' | 'doubleCheck'
  | 'shouldFail' | 'runtimeId' | 'locations' | 'tags' | 'frequency' | 'environmentVariables'
  | 'alertChannels' | 'privateLocations' | 'retryStrategy' | 'alertEscalationPolicy'>

export type PlaywrightSlimmedProp = Pick<PlaywrightCheckProps, 'name' | 'activated'
  | 'muted' | 'shouldFail' | 'locations' | 'tags' | 'frequency' | 'environmentVariables'
  | 'alertChannels' | 'privateLocations' | 'retryStrategy' | 'alertEscalationPolicy'
  | 'pwProjects' | 'pwTags' | 'installCommand'| 'testCommand'>

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
    /**
     * Playwright config path to be used during bundling and playwright config parsing
     */
    playwrightConfigPath?: string,

    /**
     * Extra files to be included into the playwright bundle
     */
    include?: string | string[],
    /**
     * List of playwright checks that use the defined playwright config path
     */
    playwrightChecks?: PlaywrightSlimmedProp[]
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

// eslint-disable-next-line no-restricted-syntax
enum Extension {
  JS = '.js',
  MJS = '.mjs',
  TS = '.ts',
}

export function loadFile (file: string) {
  if (!existsSync(file)) {
    return Promise.resolve(null)
  }
  switch (path.extname(file)) {
    case Extension.JS:
      return loadJsFile(file)
    case Extension.MJS:
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

export function getChecklyConfigFile (): {checklyConfig: string, fileName: string} | undefined {
  const filenames: string[] = ['checkly.config.ts', 'checkly.config.js', 'checkly.config.mjs']
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

export async function loadChecklyConfig (
  dir: string,
  filenames = ['checkly.config.ts', 'checkly.config.js', 'checkly.config.mjs'],
): Promise<{ config: ChecklyConfig, constructs: Construct[] }> {
  Session.loadingChecklyConfigFile = true
  Session.checklyConfigFileConstructs = []

  let config = await findConfigFile(dir, filenames)

  if (!config) {
    config = await handleMissingConfig(dir, filenames)
  }

  validateConfigFields(config, ['logicalId', 'projectName'])

  const constructs = Session.checklyConfigFileConstructs
  Session.loadingChecklyConfigFile = false
  Session.checklyConfigFileConstructs = []
  return { config, constructs }
}

async function findConfigFile (dir: string, filenames: string[]): Promise<ChecklyConfig | null> {
  for (const filename of filenames) {
    const config = await loadFile(path.join(dir, filename))
    if (config) {
      return config
    }
  }
  return null
}

async function handleMissingConfig (dir: string, filenames: string[]): Promise<ChecklyConfig> {
  const baseName = path.basename(dir)
  const playwrightConfigPath = findPlaywrightConfigPath(dir)
  if (playwrightConfigPath) {
    const checklyConfig = getDefaultChecklyConfig(baseName, `./${path.relative(dir, playwrightConfigPath)}`)
    await writeChecklyConfigFile(dir, checklyConfig)
    return checklyConfig
  }
  throw new Error(`Unable to locate a config at ${dir} with ${filenames.join(', ')}.`)
}

function findPlaywrightConfigPath (dir: string): string | undefined {
  return ['playwright.config.ts', 'playwright.config.js']
    .map(file => path.resolve(dir, file))
    .find(filePath => existsSync(filePath))
}

function validateConfigFields (config: ChecklyConfig, fields: (keyof ChecklyConfig)[]): void {
  for (const field of fields) {
    if (!config?.[field] || !isString(config[field])) {
      throw new Error(`Config object missing a ${field} as type string`)
    }
  }
}
