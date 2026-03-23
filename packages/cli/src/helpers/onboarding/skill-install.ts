import { dirname, relative } from 'path'
import chalk from 'chalk'
import prompts from 'prompts'

import { PLATFORM_TARGETS, readSkillFile, writeSkillToTarget, formatPlatformName, promptForPlatformTarget } from '../../commands/skills/install'
import { detectCliMode, detectOperator, OPERATOR_TO_PLATFORM } from '../cli-mode'
import { makeOnCancel } from './prompts-helpers'

export interface SkillInstallResult {
  installed: boolean
  platform: string | null
  targetPath: string | null
}

export function runSkillInstallStep (
  log: (msg: string) => void,
): Promise<SkillInstallResult> {
  const mode = detectCliMode()

  if (mode === 'ci') {
    return Promise.resolve({ installed: false, platform: null, targetPath: null })
  }

  if (mode === 'agent') {
    return runAgentInstall(log)
  }

  return runInteractiveInstall(log)
}

async function runAgentInstall (
  log: (msg: string) => void,
): Promise<SkillInstallResult> {
  const operator = detectOperator()
  const platform = OPERATOR_TO_PLATFORM[operator]

  if (!platform) {
    return { installed: false, platform: null, targetPath: null }
  }

  const targetDir = PLATFORM_TARGETS[platform]
  if (!targetDir) {
    return { installed: false, platform: null, targetPath: null }
  }

  try {
    const content = await readSkillFile()
    const targetPath = await writeSkillToTarget(targetDir, content)

    log(chalk.green(`Installed Checkly skill for ${formatPlatformName(platform)} at ${targetPath}`))

    return { installed: true, platform, targetPath }
  } catch (error: any) {
    log(chalk.red(`Could not install skill: ${error.message || String(error)}`))
    return { installed: false, platform: null, targetPath: null }
  }
}

async function runInteractiveInstall (
  log: (msg: string) => void,
): Promise<SkillInstallResult> {
  log('')
  log(`  Checkly is an ${chalk.bold('AI-native Monitoring as Code')} platform.`)
  log(`  For the best experience, your AI coding agent needs a ${chalk.bold('skill')} — a small`)
  log('  file that teaches it how to create and manage checks using this CLI.')
  log('')

  const { install } = await prompts({
    type: 'confirm',
    name: 'install',
    message: 'Install the Checkly skill for your AI coding agent?',
    initial: true,
  }, {
    onCancel: makeOnCancel(log),
  })

  if (!install) {
    return { installed: false, platform: null, targetPath: null }
  }

  const targetDir = await promptForPlatformTarget(makeOnCancel(log))

  if (!targetDir) {
    return { installed: false, platform: null, targetPath: null }
  }

  // Determine which platform was selected (if any) by reverse-looking up the directory
  const platformEntry = Object.entries(PLATFORM_TARGETS).find(([, dir]) => dir === targetDir)
  const platform = platformEntry ? platformEntry[0] : null

  try {
    const content = await readSkillFile()
    const targetPath = await writeSkillToTarget(targetDir, content)

    log(chalk.green(`Installed Checkly skill at ${targetPath}`))

    return {
      installed: true,
      platform,
      targetPath,
    }
  } catch (error: any) {
    log(chalk.red(`Could not install skill: ${error.message || String(error)}`))
    return { installed: false, platform: null, targetPath: null }
  }
}

export async function refreshSkill (
  skillPath: string,
  log: (msg: string) => void,
): Promise<{ installed: boolean, targetPath: string | null }> {
  try {
    const targetDir = relative(process.cwd(), dirname(skillPath))
    const content = await readSkillFile()
    const targetPath = await writeSkillToTarget(targetDir, content)
    return { installed: true, targetPath }
  } catch {
    log(chalk.dim('  Could not update skill file.'))
    return { installed: false, targetPath: null }
  }
}
