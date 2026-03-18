import { existsSync } from 'fs'
import { join } from 'path'

export interface ProjectContext {
  isExistingProject: boolean
  hasPlaywrightConfig: boolean
  playwrightConfigPath: string | null
  hasChecklyConfig: boolean
  hasChecksDir: boolean
  hasSkillInstalled: boolean
  skillPath: string | null
}

// Known directories where SKILL.md can be installed
const SKILL_DIRECTORIES = [
  '.claude/skills/checkly',
  '.cursor/skills/checkly',
  '.windsurf/skills/checkly',
  '.agents/skills/checkly',
  '.continue/skills/checkly',
  '.goose/skills/checkly',
  '.roo/skills/checkly',
]

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
