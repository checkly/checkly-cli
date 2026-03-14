import { Flags } from '@oclif/core'
import { constants } from 'fs'
import { access, mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import prompts from 'prompts'

import { BaseCommand } from '../baseCommand'

const SKILL_FILE_PATH = join(__dirname, '../../ai-context/public-skills/checkly/SKILL.md')
const SKILL_FILENAME = 'SKILL.md'

const PLATFORM_TARGETS: Record<string, string> = {
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

    if (this.isNonInteractive()) {
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
      return await readFile(SKILL_FILE_PATH, 'utf8')
    } catch {
      this.error(`Failed to read skill file at ${SKILL_FILE_PATH}`)
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

  private async promptForTarget (): Promise<string | undefined> {
    const choices = [
      ...Object.entries(PLATFORM_TARGETS).map(([platform, dir]) => ({
        title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} (${dir}/)`,
        value: dir,
      })),
      {
        title: 'Custom path',
        value: '__custom__',
      },
    ]

    const { target } = await prompts({
      type: 'select',
      name: 'target',
      message: 'Where do you want to install the Checkly agent skill?',
      choices,
      initial: 0,
    })

    if (target === undefined) {
      return undefined
    }

    if (target === '__custom__') {
      const { customPath } = await prompts({
        type: 'text',
        name: 'customPath',
        message: 'Enter the target directory:',
      })
      return customPath || undefined
    }

    return target
  }

  private async installSkill (content: string, targetDir: string, force: boolean): Promise<void> {
    const absoluteDir = join(process.cwd(), targetDir)
    const targetPath = join(absoluteDir, SKILL_FILENAME)

    try {
      await mkdir(absoluteDir, { recursive: true })
    } catch {
      this.error(`Failed to create directory ${absoluteDir}`)
    }

    if (!force) {
      const shouldOverwrite = await this.confirmOverwrite(targetPath)
      if (!shouldOverwrite) {
        this.log(`Skipped ${targetPath}`)
        return
      }
    }

    try {
      await writeFile(targetPath, content, 'utf8')
    } catch {
      this.error(`Failed to write skill file to ${targetPath}`)
    }

    this.style.shortSuccess(`Installed Checkly agent skill to: ${targetPath}`)
  }

  private isNonInteractive (): boolean {
    return !process.stdin.isTTY
      || !process.stdout.isTTY
      || !!process.env.CI
      || !!process.env.CHECKLY_NON_INTERACTIVE
  }

  private async confirmOverwrite (targetPath: string): Promise<boolean> {
    try {
      await access(targetPath, constants.F_OK)
    } catch {
      return true
    }

    if (this.isNonInteractive()) {
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
