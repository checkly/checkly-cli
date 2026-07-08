import { BaseCommand } from './baseCommand.js'

export default class Rules extends BaseCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static state = 'deprecated'
  static description =
    'Deprecated. Use `checkly skills` instead.'

  run (): Promise<void> {
    this.log('The `rules` command is deprecated. Use `checkly skills` instead.')
    return Promise.resolve()
  }
}
