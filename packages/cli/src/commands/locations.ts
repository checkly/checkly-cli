import * as api from '../rest/api'
import { BaseCommand } from './baseCommand'

export default class Locations extends BaseCommand {
  static hidden = false
  static description = 'List all supported locations'
  async run (): Promise<void> {
    const { data: locations } = await api.locations.getAll()
    const output = locations.map(l => l.region)
    this.log(JSON.stringify(output, null, 2))
  }
}
