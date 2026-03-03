import { Args } from '@oclif/core'
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'

import { ACTIONS } from '../../ai-context/context'
import { BaseCommand } from '../baseCommand'

const REFERENCES_DIR = join(__dirname, '../../ai-context/skills-command/references')

export default class SkillsShow extends BaseCommand {
  static hidden = false
  static description = 'Show the content of the Checkly AI agent skill, action or one of its references.'

  static args = {
    action: Args.string({
      required: true,
      description: 'The action name (e.g. "configure", "setup").',
    }),
    reference: Args.string({
      required: false,
      description: 'A specific reference within the action (e.g. "api-checks").',
    }),
  }

  async run (): Promise<void> {
    const { args } = await this.parse(SkillsShow)
    const refsDir = REFERENCES_DIR

    const actionIds: string[] = ACTIONS.map(a => a.id)
    if (!actionIds.includes(args.action)) {
      this.error(
        `Action "${args.action}" not found.`
        + `\n\nAvailable actions: ${actionIds.join(', ')}`,
      )
    }

    if (args.reference) {
      // Join action + reference to get the flat filename: configure-api-checks.md
      const filename = `${args.action}-${args.reference}.md`
      const refPath = join(refsDir, filename)
      try {
        const content = await readFile(refPath, 'utf8')
        this.log(content)
      } catch {
        const available = await this.listAvailableReferences(refsDir, args.action)
        this.error(
          `Reference "${args.reference}" not found for action "${args.action}".`
          + (available.length > 0
            ? `\n\nAvailable references: ${available.join(', ')}`
            : ''),
        )
      }
    } else {
      // Show the action file itself: configure.md or setup.md
      const actionPath = join(refsDir, `${args.action}.md`)
      try {
        const content = await readFile(actionPath, 'utf8')
        this.log(content)
      } catch {
        this.error(`Could not read action file for "${args.action}".`)
      }
    }
  }

  private async listAvailableReferences (refsDir: string, action: string): Promise<string[]> {
    try {
      const files = await readdir(refsDir)
      const prefix = `${action}-`
      return files
        .filter(f => f.endsWith('.md') && f.startsWith(prefix))
        .map(f => f.replace(/\.md$/, '').slice(prefix.length))
        .sort()
    } catch {
      return []
    }
  }
}
