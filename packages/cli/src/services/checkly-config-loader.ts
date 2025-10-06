import * as path from 'path'
import fs from 'node:fs/promises'
import { findPlaywrightConfigPath, getDefaultChecklyConfig, writeChecklyConfigFile } from './util'
import { CheckProps, RuntimeCheckProps } from '../constructs/check'
import { PlaywrightCheckProps } from '../constructs/playwright-check'
import { Session } from '../constructs'
import { Construct } from '../constructs/construct'
import type { Region } from '..'
import { ReporterType } from '../reporters/reporter'
import { PlaywrightConfig } from '../constructs/playwright-config'
import { FileLoader } from '../loader'

export type CheckConfigDefaults =
  Pick<CheckProps,
  | 'activated'
  | 'alertChannels'
  | 'alertEscalationPolicy'
  | 'doubleCheck'
  | 'frequency'
  | 'locations'
  | 'muted'
  | 'privateLocations'
  | 'retryStrategy'
  | 'shouldFail'
  | 'tags'
  >
  & Pick<RuntimeCheckProps,
  | 'environmentVariables'
  | 'runtimeId'
  >
  // This is used by BrowserChecks and MultiStepChecks.
  & { playwrightConfig?: PlaywrightConfig }

export type PlaywrightSlimmedProp = Pick<PlaywrightCheckProps, 'name' | 'activated'
  | 'muted' | 'shouldFail' | 'locations' | 'tags' | 'frequency' | 'environmentVariables'
  | 'alertChannels' | 'privateLocations' | 'retryStrategy' | 'alertEscalationPolicy'
  | 'pwProjects' | 'pwTags' | 'installCommand' | 'testCommand' | 'group' | 'groupName' | 'runParallel'> & { logicalId: string, playwrightConfigPath?: string }

export type ChecklyConfig = {
  /**
   * Friendly name for your project.
   */
  projectName: string
  /**
   * Unique project identifier.
   */
  logicalId: string
  /**
   * Git repository URL.
   */
  repoUrl?: string
  /**
   * Checks default configuration properties.
   */
  checks?: CheckConfigDefaults & {
    /**
     * Glob pattern where the CLI looks for files containing Check constructs, i.e. all `.checks.ts` files
     */
    checkMatch?: string | string[]
    /**
     * List of glob patterns with directories to ignore.
     */
    ignoreDirectoriesMatch?: string[]

    playwrightConfig?: PlaywrightConfig

    /**
     * Browser checks default configuration properties.
     */
    browserChecks?: CheckConfigDefaults & {
      /**
       * Glob pattern where the CLI looks for Playwright test files, i.e. all `.spec.ts` files
       */
      testMatch?: string | string[]
    }
    /**
     * Multistep checks default configuration properties.
     */
    multiStepChecks?: CheckConfigDefaults & {
      /**
       * Glob pattern where the CLI looks for Playwright test files, i.e. all `.spec.ts` files
       */
      testMatch?: string | string[]
    }
    /**
     * Playwright config path to be used during bundling and playwright config parsing
     */
    playwrightConfigPath?: string

    /**
     * Extra files to be included into the playwright bundle
     */
    include?: string | string[]
    /**
     * List of playwright checks that use the defined playwright config path
     */
    playwrightChecks?: PlaywrightSlimmedProp[]
  }
  /**
   * CLI default configuration properties.
   */
  cli?: {
    runLocation?: keyof Region
    privateRunLocation?: string
    verbose?: boolean
    reporters?: ReporterType[]
    retries?: number
    loader?: FileLoader
  }
}

function isString (obj: any) {
  return (Object.prototype.toString.call(obj) === '[object String]')
}

export async function getChecklyConfigFile (): Promise<{ checklyConfig: string, fileName: string } | undefined> {
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
    const configFilePath = path.resolve(dir, configFile)
    try {
      await fs.access(configFilePath, fs.constants.R_OK)
    } catch {
      continue
    }
    const file = await fs.readFile(configFilePath)
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

export async function loadChecklyConfig (dir: string, filenames = ['checkly.config.ts', 'checkly.config.mts', 'checkly.config.cts', 'checkly.config.js', 'checkly.config.mjs', 'checkly.config.cjs'], writeChecklyConfig: boolean = true, playwrightConfigPath?: string): Promise<{ config: ChecklyConfig, constructs: Construct[] }> {
  let config: ChecklyConfig | undefined
  Session.loadingChecklyConfigFile = true
  Session.checklyConfigFileConstructs = []
  for (const filename of filenames) {
    const filePath = path.join(dir, filename)
    try {
      await fs.access(filePath, fs.constants.R_OK)
    } catch {
      continue
    }
    config = await Session.loadFile<ChecklyConfig>(filePath)
    break
  }
  if (!config) {
    config = await handleMissingConfig(dir, filenames, writeChecklyConfig, playwrightConfigPath)
  }
  validateConfigFields(config, ['logicalId', 'projectName'] as const)

  const constructs = Session.checklyConfigFileConstructs
  Session.loadingChecklyConfigFile = false
  Session.checklyConfigFileConstructs = []
  if (config.cli?.loader) {
    Session.loader = config.cli.loader
  }
  return { config, constructs }
}

async function handleMissingConfig (
  dir: string,
  filenames: string[],
  shouldWriteConfig: boolean = true,
  pwPath?: string,
): Promise<ChecklyConfig> {
  const baseName = path.basename(dir)
  const playwrightConfigPath = pwPath ?? findPlaywrightConfigPath(dir)
  if (playwrightConfigPath) {
    const checklyConfig = getDefaultChecklyConfig(baseName, `./${path.relative(dir, playwrightConfigPath)}`)
    if (shouldWriteConfig) {
      await writeChecklyConfigFile(dir, checklyConfig)
    }
    return checklyConfig
  }
  throw new ConfigNotFoundError(`Unable to locate a config at ${dir} with ${filenames.join(', ')}.`)
}

function validateConfigFields (config: ChecklyConfig, fields: (keyof ChecklyConfig)[]): void {
  for (const field of fields) {
    if (!config?.[field] || !isString(config[field])) {
      throw new Error(`Config object missing a ${field} as type string`)
    }
  }
}
