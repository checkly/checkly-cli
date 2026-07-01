import { existsSync } from 'fs'
import { join } from 'path'

import { findInstalledSkills } from '../../services/skills.js'
import { findPlaywrightConfigPath } from '../../services/util.js'
import { defaultFilenames as CHECKLY_CONFIG_NAMES } from '../../services/checkly-config-loader.js'

export interface ProjectContext {
  isExistingProject: boolean
  hasPlaywrightConfig: boolean
  playwrightConfigPath: string | null
  hasChecklyConfig: boolean
  hasChecksDir: boolean
  hasSkillInstalled: boolean
  skillPaths: string[]
}

export function detectProjectContext (projectDir: string): ProjectContext {
  const isExistingProject = existsSync(join(projectDir, 'package.json'))

  const playwrightConfigPath = findPlaywrightConfigPath(projectDir) ?? null

  const hasChecklyConfig = CHECKLY_CONFIG_NAMES.some(
    name => existsSync(join(projectDir, name)),
  )

  const hasChecksDir = existsSync(join(projectDir, '__checks__'))

  const skillPaths = findInstalledSkills(projectDir)

  return {
    isExistingProject,
    hasPlaywrightConfig: playwrightConfigPath !== null,
    playwrightConfigPath,
    hasChecklyConfig,
    hasChecksDir,
    hasSkillInstalled: skillPaths.length > 0,
    skillPaths,
  }
}
