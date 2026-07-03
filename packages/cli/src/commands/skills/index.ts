import { Args } from '@oclif/core'
import { readFile, readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'node:url'

import { ACTIONS, SKILL } from '../../ai-context/context.js'
import { BaseCommand } from '../baseCommand.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const REFERENCES_DIR = join(__dirname, '../../ai-context/skills-command/references')

function referenceShortId (actionId: string, referenceId: string): string {
  return referenceId.replace(`${actionId}-`, '')
}

function formatAvailableActionTree (): string {
  return [
    '  checkly skills',
    ...ACTIONS.flatMap(action => {
      const actionLine = `  |- ${action.id}`
      if (!('references' in action)) {
        return [actionLine]
      }

      const references = action.references
        .map(reference => `  |  |- ${referenceShortId(action.id, reference.id)}`)
      return [actionLine, ...references]
    }),
  ].join('\n')
}

export default class Skills extends BaseCommand {
  static hidden = false
  static readOnly = true
  static destructive = false
  static idempotent = true
  static description = [
    'Show Checkly AI skills, actions and their references.',
    '',
    'Run `checkly skills` to print the full catalog, `checkly skills <action>` for an action guide, or `checkly skills <action> <reference>` for a specific reference.',
    '',
    'Available actions and references:',
    formatAvailableActionTree(),
    '',
    'Use `checkly skills <action>` or `checkly skills <action> <reference>` to open the detailed guidance.',
  ].join('\n')

  static examples = [
    'checkly skills',
    'checkly skills configure',
    'checkly skills configure api-checks',
    'checkly skills investigate alerting',
  ]

  static args = {
    action: Args.string({
      required: false,
      description: 'Action to open. Available actions are listed below.',
    }),
    reference: Args.string({
      required: false,
      description: 'Reference to open for the selected action. Available references are listed below.',
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
    for (const action of ACTIONS) {
      this.log(`  $ checkly skills ${action.id}`)
      if ('references' in action) {
        const firstRef = action.references[0]
        const refId = referenceShortId(action.id, firstRef.id)
        this.log(`  $ checkly skills ${action.id} ${refId}`)
      }
    }
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
        shortId: referenceShortId(action.id, r.id),
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
