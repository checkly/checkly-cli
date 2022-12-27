import * as path from 'path'
import { existsSync } from 'fs'
import { loadJsFile, loadTsFile } from './util'

export type ChecklyConfig = {
  projectName: string,
  logicalId: string,
  repoUrl: string,
  checks?: {
    locations?: string[],
    runtimeId?: string,
    checkMatch?: string,
    ignoreDirectoriesMatch?: string[],
    browserChecks?: {
      checkMatch?: string,
    },
  },
  cli?: {
    runLocation?: string,
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
