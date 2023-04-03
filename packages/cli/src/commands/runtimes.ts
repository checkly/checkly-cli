import * as api from '../rest/api'
import { BaseCommand } from './baseCommand'

export default class Runtimes extends BaseCommand {
  static hidden = false
  static description = 'List all supported runtimes and dependencies'
  async run (): Promise<void> {
    const { data: runtimes } = await api.runtimes.getAll()
    const output = runtimes
      .sort((a, b) => b.name.localeCompare(a.name))
      .map(r => {
        const { node, ...dependencies } = r.dependencies
        return {
          name: r.name,
          description: r.description,
          stage: r.stage,
          nodeVersion: node,
          dependencies,
        }
      })
    this.log(JSON.stringify(output, null, 2))
  }
}
