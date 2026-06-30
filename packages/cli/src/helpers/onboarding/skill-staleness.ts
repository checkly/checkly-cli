import { readFile } from 'fs/promises'
import { join } from 'path'

import { PLATFORM_TARGETS, readSkillFile } from '../../commands/skills/install.js'

export interface StaleSkill {
  dir: string
  targetPath: string
}

// Multiple platforms share the same target dir (e.g. .agents/skills/checkly),
// so dedupe before comparing to avoid reporting the same file twice.
const SKILL_DIRECTORIES = [...new Set(Object.values(PLATFORM_TARGETS))]

// Compares each installed SKILL.md against the skill bundled with this CLI
// version. Any byte difference means the installed skill is out of date (the
// install path writes the bundled file verbatim, so a fresh install matches
// exactly). Mirrors playwright-cli's content-based staleness check.
export async function findStaleSkills (projectDir: string): Promise<StaleSkill[]> {
  let bundled: string
  try {
    bundled = await readSkillFile()
  } catch {
    // No bundled skill to compare against — nothing we can assert.
    return []
  }

  const stale: StaleSkill[] = []
  for (const dir of SKILL_DIRECTORIES) {
    const targetPath = join(projectDir, dir, 'SKILL.md')

    let installed: string
    try {
      installed = await readFile(targetPath, 'utf8')
    } catch {
      // Not installed in this dir — don't nag about skills the user never added.
      continue
    }

    if (installed !== bundled) {
      stale.push({ dir, targetPath })
    }
  }

  return stale
}
