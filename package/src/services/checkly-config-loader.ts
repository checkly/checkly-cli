import * as path from 'path'
import { existsSync } from 'fs'
import { loadJsFile, loadTsFile } from './util'
import { EnvironmentVariable } from '../constructs/environment-variable'
import type { LocationCode } from '../types/LocationCode'


export type CheckConfigDefaults = {
  activated?: boolean,
  muted?: boolean,
  doubleCheck?: boolean,
  shouldFail?: boolean,
  runtimeId?: string,
  locations?: Array<LocationCode>,
  tags?: Array<string>,
  frequency?: number,
  environmentVariables?: Array<EnvironmentVariable>,
  // TODO: How would a user declare default alert channels?
  // We need some additional work before constructs can be created in checkly.config.js.
  // alertChannels?: Array<AlertChannel>,
}

export type ChecklyConfig = {
  projectName: string,
  logicalId: string,
  repoUrl: string,
  checks?: CheckConfigDefaults & {
    locations?: LocationCode[],
    runtimeId?: string,
    checkMatch?: string,
    ignoreDirectoriesMatch?: string[],
    browserChecks?: CheckConfigDefaults & {
      testMatch?: string,
    },
  },
  cli?: {
    runLocation?: string,
    privateRunLocation?: string,
  }
}

export function loadChecklyConfig (dir: string): Promise<ChecklyConfig> {
  // TODO: Add proper error messages for missing config fields
  if (existsSync(path.join(dir, 'checkly.config.js'))) {
    return loadJsFile(path.join(dir, 'checkly.config.js'))
  } else if (existsSync(path.join(dir, 'checkly.config.ts'))) {
    return loadTsFile(path.join(dir, 'checkly.config.ts'))
  } else {
    throw new Error('Unable to find checkly.config.js or checkly.config.ts in the current directory.')
  }
}
