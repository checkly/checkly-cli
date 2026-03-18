import { existsSync } from 'fs'
import { join } from 'path'

import { PLATFORM_TARGETS } from '../../commands/skills/install'
import { findPlaywrightConfigPath } from '../../services/util'
import { defaultFilenames as CHECKLY_CONFIG_NAMES } from '../../services/checkly-config-loader'

export interface ProjectContext {
  isExistingProject: boolean
  hasPlaywrightConfig: boolean
  playwrightConfigPath: string | null
  hasChecklyConfig: boolean
  hasChecksDir: boolean
  hasSkillInstalled: boolean
  skillPath: string | null
}

// Derive from PLATFORM_TARGETS so they stay in sync automatically
const SKILL_DIRECTORIES = [...new Set(Object.values(PLATFORM_TARGETS))]

export function detectProjectContext (projectDir: string): ProjectContext {
  const isExistingProject = existsSync(join(projectDir, 'package.json'))

  const playwrightConfigPath = findPlaywrightConfigPath(projectDir) ?? null

  const hasChecklyConfig = CHECKLY_CONFIG_NAMES.some(
    name => existsSync(join(projectDir, name)),
  )

  const hasChecksDir = existsSync(join(projectDir, '__checks__'))

  let skillPath: string | null = null
  for (const dir of SKILL_DIRECTORIES) {
    const fullPath = join(projectDir, dir, 'SKILL.md')
    if (existsSync(fullPath)) {
      skillPath = fullPath
      break
    }
  }

  return {
    isExistingProject,
    hasPlaywrightConfig: playwrightConfigPath !== null,
    playwrightConfigPath,
    hasChecklyConfig,
    hasChecksDir,
    hasSkillInstalled: skillPath !== null,
    skillPath,
  }
}
