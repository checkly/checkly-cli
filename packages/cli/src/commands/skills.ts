import { Args } from '@oclif/core'
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'

import { ACTIONS, SKILL } from '../ai-context/context'
import { BaseCommand } from './baseCommand'

const REFERENCES_DIR = join(__dirname, '../ai-context/skills-command/references')

export default class Skills extends BaseCommand {
  static hidden = false
  static description = 'Show Checkly AI skills, actions and their references.'

  static args = {
    action: Args.string({
      required: false,
      description: 'The action name (e.g. "configure", "setup").',
    }),
    reference: Args.string({
      required: false,
      description: 'A specific reference within the action (e.g. "api-checks").',
    }),
  }

  async run (): Promise<void> {
    const { args } = await this.parse(Skills)

    if (!args.action) {
      this.printOverview()
      return
    }

    const actionIds: string[] = ACTIONS.map(a => a.id)
    if (!actionIds.includes(args.action)) {
      this.error(
        `Action "${args.action}" not found.`
        + `\n\nAvailable actions: ${actionIds.join(', ')}`,
      )
    }

    if (args.reference) {
      const filename = `${args.action}-${args.reference}.md`
      const refPath = join(REFERENCES_DIR, filename)
      try {
        const content = await readFile(refPath, 'utf8')
        this.log(content)
      } catch {
        const available = await this.listAvailableReferences(args.action)
        this.error(
          `Reference "${args.reference}" not found for action "${args.action}".`
          + (available.length > 0
            ? `\n\nAvailable references: ${available.join(', ')}`
            : ''),
        )
      }
    } else {
      const actionPath = join(REFERENCES_DIR, `${args.action}.md`)
      try {
        const content = await readFile(actionPath, 'utf8')
        this.log(content)
      } catch {
        this.error(`Could not read action file for "${args.action}".`)
      }
    }
  }

  private printOverview (): void {
    this.log(`${SKILL.description}\n`)

    this.log('Examples:\n')
    this.log('  $ checkly skills setup')
    this.log('  $ checkly skills configure')
    this.log('  $ checkly skills configure api-checks')
    this.log('')

    this.log('Actions:\n')

    const maxActionLen = Math.max(...ACTIONS.map(a => a.id.length))

    for (const action of ACTIONS) {
      const desc = action.description ? `${action.description}` : ''
      this.log(`  ${action.id.padEnd(maxActionLen + 2)}${desc}`)
    }

    this.log('')

    for (const action of ACTIONS) {
      if (!('references' in action)) continue

      this.log(`References for "${action.id}":\n`)

      const refs = action.references.map(r => ({
        shortId: r.id.replace(`${action.id}-`, ''),
        description: r.description,
      }))
      const maxRefLen = Math.max(...refs.map(r => r.shortId.length))

      for (const ref of refs) {
        const desc = ref.description ? ref.description : ''
        this.log(`  ${ref.shortId.padEnd(maxRefLen + 2)}${desc}`)
      }

      this.log('')
    }
  }

  private async listAvailableReferences (action: string): Promise<string[]> {
    try {
      const files = await readdir(REFERENCES_DIR)
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
