import { Flags } from '@oclif/core'
import { constants } from 'fs'
import { access } from 'fs/promises'
import { join } from 'path'
import prompts from 'prompts'

import { detectCliMode } from '../../helpers/cli-mode.js'
import { BaseCommand } from '../baseCommand.js'
import {
  PLATFORM_TARGETS,
  readSkillFile,
  writeSkillToTarget,
  promptForPlatformTarget,
} from '../../services/skills.js'

const SKILL_FILENAME = 'SKILL.md'

const VALID_TARGETS = Object.keys(PLATFORM_TARGETS)

export default class SkillsInstall extends BaseCommand {
  static hidden = false
  static idempotent = true
  static description = 'Install the Checkly agent skill (SKILL.md) into your project.'

  static flags = {
    target: Flags.string({
      char: 't',
      description: `Platform to install the skill for (${VALID_TARGETS.join(', ')}).`,
      exclusive: ['path'],
    }),
    path: Flags.string({
      char: 'p',
      description: 'Custom target directory to install the skill into.',
      exclusive: ['target'],
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Overwrite existing SKILL.md without confirmation.',
      default: false,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(SkillsInstall)

    const skillContent = await this.readSkillFile()

    const targetDir = this.resolveTarget(flags)

    if (targetDir) {
      await this.installSkill(skillContent, targetDir, flags.force)
      return
    }

    if (detectCliMode() !== 'interactive') {
      const flagCol = '--target '.length
      const maxLen = Math.max(...VALID_TARGETS.map(t => t.length))
      const descCol = flagCol + maxLen + 2
      const padTo = (flag: string, arg: string) =>
        `  ${(flag + ' ' + arg).padEnd(descCol)}`

      this.log('Non-interactive mode detected. Use one of the following flags:\n')
      for (const [name, dir] of Object.entries(PLATFORM_TARGETS)) {
        this.log(`${padTo('--target', name)}Install to ${dir}/`)
      }
      this.log(`${padTo('--path', '<dir>')}Install to a custom directory`)
      this.log(`${padTo('--force', '')}Overwrite existing SKILL.md without confirmation`)
      this.log('\nExample: npx checkly skills install --target claude --force')
      return
    }

    const selectedDir = await this.promptForTarget()
    if (!selectedDir) {
      this.log('Cancelled. No skill file written.')
      return
    }

    await this.installSkill(skillContent, selectedDir, flags.force)
  }

  private async readSkillFile (): Promise<string> {
    try {
      return await readSkillFile()
    } catch (err: any) {
      this.error(err.message)
    }
  }

  private resolveTarget (flags: { target?: string, path?: string }): string | undefined {
    if (flags.path) {
      return flags.path
    }

    if (flags.target) {
      const dir = PLATFORM_TARGETS[flags.target]
      if (!dir) {
        this.error(
          `Unknown target "${flags.target}".`
          + `\n\nAvailable targets: ${VALID_TARGETS.join(', ')}`,
        )
      }
      return dir
    }

    return undefined
  }

  private promptForTarget (): Promise<string | undefined> {
    return promptForPlatformTarget()
  }

  private async installSkill (content: string, targetDir: string, force: boolean): Promise<void> {
    const absoluteDir = join(process.cwd(), targetDir)
    const targetPath = join(absoluteDir, SKILL_FILENAME)

    if (!force) {
      const shouldOverwrite = await this.confirmOverwrite(targetPath)
      if (!shouldOverwrite) {
        this.log(`Skipped ${targetPath}`)
        return
      }
    }

    try {
      const writtenPath = await writeSkillToTarget(targetDir, content)
      this.style.shortSuccess(`Installed Checkly agent skill to: ${writtenPath}`)
    } catch (err: any) {
      this.error(err.message)
    }
  }

  private async confirmOverwrite (targetPath: string): Promise<boolean> {
    try {
      await access(targetPath, constants.F_OK)
    } catch {
      return true
    }

    if (detectCliMode() !== 'interactive') {
      this.log(`Skill file already exists at ${targetPath}. Use --force to overwrite.`)
      return false
    }

    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: `Skill file already exists at ${targetPath}. Overwrite?`,
      initial: false,
    })

    return overwrite ?? false
  }
}
