import { ACTIONS, SKILL } from '../../ai-context/context'
import { BaseCommand } from '../baseCommand'

export default class SkillsList extends BaseCommand {
  static hidden = false
  static description = 'List available Checkly AI skills, actions and their references.'

  // eslint-disable-next-line require-await
  async run (): Promise<void> {
    this.log(`${SKILL.description}\n`)
    this.log('Actions:\n')

    const maxActionLen = Math.max(...ACTIONS.map(a => a.id.length))

    for (const action of ACTIONS) {
      const desc = action.description ? ` - ${action.description}` : ''
      this.log(`  ${action.id.padEnd(maxActionLen + 2)}${desc}`)
      this.log(`  ${' '.padEnd(maxActionLen + 2)}Run: checkly skills show ${action.id}`)

      if ('references' in action && action.references.length > 0) {
        this.log('')
        this.log('    References:')
        const refs = action.references.map(r => r.id.replace(`${action.id}-`, ''))
        const maxRefLen = Math.max(...refs.map(r => r.length))
        for (const ref of refs) {
          this.log(`      ${ref.padEnd(maxRefLen + 2)}Run: checkly skills show ${action.id} ${ref}`)
        }
      }

      this.log('')
    }
  }
}
