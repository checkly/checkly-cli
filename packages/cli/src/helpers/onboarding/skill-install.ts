import chalk from 'chalk'
import prompts from 'prompts'

import { PLATFORM_TARGETS, readSkillFile, writeSkillToTarget } from '../../commands/skills/install'
import { detectCliMode, detectOperator, OPERATOR_TO_PLATFORM } from '../cli-mode'

export interface SkillInstallResult {
  installed: boolean
  platform: string | null
  targetPath: string | null
}

const CUSTOM_PATH_VALUE = '__custom__'

function formatPlatformName (platform: string): string {
  return platform
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
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

  const content = await readSkillFile()
  const targetPath = await writeSkillToTarget(targetDir, content)

  log(chalk.green(`Installed Checkly skill for ${formatPlatformName(platform)} at ${targetPath}`))

  return { installed: true, platform, targetPath }
}

async function runInteractiveInstall (
  log: (msg: string) => void,
): Promise<SkillInstallResult> {
  const { install } = await prompts({
    type: 'confirm',
    name: 'install',
    message: 'Install the Checkly skill?',
    initial: true,
  })

  if (!install) {
    return { installed: false, platform: null, targetPath: null }
  }

  const choices = [
    ...Object.entries(PLATFORM_TARGETS).map(([platform, dir]) => ({
      title: `${formatPlatformName(platform)} ${chalk.dim(`(${dir}/)`)}`,
      value: platform,
    })),
    {
      title: 'Custom path',
      value: CUSTOM_PATH_VALUE,
    },
  ]

  const { platform } = await prompts({
    type: 'select',
    name: 'platform',
    message: 'Select a platform:',
    choices,
    initial: 0,
  })

  if (platform === undefined) {
    return { installed: false, platform: null, targetPath: null }
  }

  let targetDir: string

  if (platform === CUSTOM_PATH_VALUE) {
    const { customPath } = await prompts({
      type: 'text',
      name: 'customPath',
      message: 'Enter the target directory:',
    })

    if (!customPath) {
      return { installed: false, platform: null, targetPath: null }
    }

    targetDir = customPath
  } else {
    targetDir = PLATFORM_TARGETS[platform]
  }

  const content = await readSkillFile()
  const targetPath = await writeSkillToTarget(targetDir, content)

  log(chalk.green(`Installed Checkly skill at ${targetPath}`))

  return {
    installed: true,
    platform: platform === CUSTOM_PATH_VALUE ? null : platform,
    targetPath,
  }
}
