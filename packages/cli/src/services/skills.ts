import chalk from 'chalk'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import prompts from 'prompts'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const SKILL_FILE_PATH = join(__dirname, '../ai-context/public-skills/checkly/SKILL.md')
const SKILL_FILENAME = 'SKILL.md'

export const PLATFORM_TARGETS: Record<string, string> = {
  'amp': '.agents/skills/checkly',
  'claude': '.claude/skills/checkly',
  'cline': '.agents/skills/checkly',
  'codex': '.agents/skills/checkly',
  'continue': '.continue/skills/checkly',
  'cursor': '.cursor/skills/checkly',
  'gemini-cli': '.agents/skills/checkly',
  'github-copilot': '.agents/skills/checkly',
  'goose': '.goose/skills/checkly',
  'opencode': '.agents/skills/checkly',
  'roo': '.roo/skills/checkly',
  'windsurf': '.windsurf/skills/checkly',
}

// Multiple platforms share the same target dir (e.g. .agents/skills/checkly),
// so dedupe before comparing to avoid reporting the same file twice.
const SKILL_DIRECTORIES = [...new Set(Object.values(PLATFORM_TARGETS))]

export async function readSkillFile (): Promise<string> {
  try {
    return await readFile(SKILL_FILE_PATH, 'utf8')
  } catch {
    throw new Error(`Failed to read skill file at ${SKILL_FILE_PATH}`)
  }
}

export async function writeSkillToTarget (targetDir: string, content: string): Promise<string> {
  const absoluteDir = join(process.cwd(), targetDir)
  const targetPath = join(absoluteDir, SKILL_FILENAME)

  try {
    await mkdir(absoluteDir, { recursive: true })
  } catch {
    throw new Error(`Failed to create directory ${absoluteDir}`)
  }

  try {
    await writeFile(targetPath, content, 'utf8')
  } catch {
    throw new Error(`Failed to write skill file to ${targetPath}`)
  }

  return targetPath
}

export function formatPlatformName (platform: string): string {
  return platform
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export async function promptForPlatformTarget (
  onCancel?: () => void,
): Promise<string | undefined> {
  const choices = [
    ...Object.entries(PLATFORM_TARGETS).map(([platform, dir]) => ({
      title: `${formatPlatformName(platform)} ${chalk.dim(`(${dir}/)`)}`,
      value: platform,
    })),
    {
      title: 'Custom path',
      value: '__custom__',
    },
  ]

  const promptOptions = onCancel ? { onCancel } : {}

  const { platform } = await prompts({
    type: 'select',
    name: 'platform',
    message: 'Which AI coding agent do you use?',
    choices,
    initial: 0,
  }, promptOptions)

  if (platform === undefined) return undefined

  if (platform === '__custom__') {
    const { customPath } = await prompts({
      type: 'text',
      name: 'customPath',
      message: 'Enter the target directory:',
    }, promptOptions)
    return customPath || undefined
  }

  return PLATFORM_TARGETS[platform]
}

// Returns the SKILL.md path for every agent directory that has one installed.
// A project can carry the skill in several dirs at once (e.g. one per agent),
// so this returns all of them rather than the first match.
export function findInstalledSkills (projectDir: string): string[] {
  return SKILL_DIRECTORIES
    .map(dir => join(projectDir, dir, SKILL_FILENAME))
    .filter(targetPath => existsSync(targetPath))
}

export interface StaleSkill {
  dir: string
  targetPath: string
}

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
    const targetPath = join(projectDir, dir, SKILL_FILENAME)

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
