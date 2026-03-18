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
  log(chalk.dim('  A skill teaches your AI coding agent how to use Checkly effectively.'))
  log('')

  const { install } = await prompts({
    type: 'confirm',
    name: 'install',
    message: 'Install the Checkly skill for your AI coding agent?',
    initial: true,
  }, {
    onCancel: () => {
      log('\nSetup cancelled. Run npx checkly init anytime to try again.')
      process.exit(0)
    },
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
    message: 'Which AI coding agent do you use?',
    choices,
    initial: 0,
  }, {
    onCancel: () => {
      log('\nSetup cancelled. Run npx checkly init anytime to try again.')
      process.exit(0)
    },
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
    }, {
      onCancel: () => {
        log('\nSetup cancelled. Run npx checkly init anytime to try again.')
        process.exit(0)
      },
    })

    if (!customPath) {
      return { installed: false, platform: null, targetPath: null }
    }

    targetDir = customPath
  } else {
    targetDir = PLATFORM_TARGETS[platform]
  }

  try {
    const content = await readSkillFile()
    const targetPath = await writeSkillToTarget(targetDir, content)

    log(chalk.green(`Installed Checkly skill at ${targetPath}`))

    return {
      installed: true,
      platform: platform === CUSTOM_PATH_VALUE ? null : platform,
      targetPath,
    }
  } catch (error: any) {
    log(chalk.red(`Could not install skill: ${error.message || String(error)}`))
    return { installed: false, platform: null, targetPath: null }
  }
}
