import { existsSync } from 'fs'
import { join } from 'path'

export interface ProjectContext {
  isExistingProject: boolean
  hasPlaywrightConfig: boolean
  playwrightConfigPath: string | null
  hasChecklyConfig: boolean
  hasChecksDir: boolean
}

const PLAYWRIGHT_CONFIG_NAMES = [
  'playwright.config.ts',
  'playwright.config.js',
  'playwright.config.mts',
  'playwright.config.mjs',
]

const CHECKLY_CONFIG_NAMES = [
  'checkly.config.ts',
  'checkly.config.js',
  'checkly.config.mts',
  'checkly.config.mjs',
]

export function detectProjectContext (projectDir: string): ProjectContext {
  const isExistingProject = existsSync(join(projectDir, 'package.json'))

  let playwrightConfigPath: string | null = null
  for (const name of PLAYWRIGHT_CONFIG_NAMES) {
    const fullPath = join(projectDir, name)
    if (existsSync(fullPath)) {
      playwrightConfigPath = fullPath
      break
    }
  }

  let hasChecklyConfig = false
  for (const name of CHECKLY_CONFIG_NAMES) {
    if (existsSync(join(projectDir, name))) {
      hasChecklyConfig = true
      break
    }
  }

  const hasChecksDir = existsSync(join(projectDir, '__checks__'))

  return {
    isExistingProject,
    hasPlaywrightConfig: playwrightConfigPath !== null,
    playwrightConfigPath,
    hasChecklyConfig,
    hasChecksDir,
  }
}
