import * as api from '../../rest/api'
import { Flags, Args, ux } from '@oclif/core'
import { AuthCommand } from '../authCommand'

export default class EnvAdd extends AuthCommand {
  static hidden = false
  static description = 'Add environment variable via checkly env add <key> <locked>'

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'force mode',
      default: false,
    }),
  }

  static args = {
    fileArgs: Args.string({
      name: 'subcommands',
      required: false,
      description: 'Subcommand env',
      default: 'ls',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { argv } = await this.parse(EnvAdd)
    const subcommands = argv as string[]

    if (subcommands.length > 4) {
      this.error('Too many arguments. Please use "checkly env add <key> <locked>.')
      return
    }

    // add env variable
    if (!subcommands[1]) {
      this.error('Please provide a variable key to add')
    }
    let locked = false
    if (subcommands[2]) {
      locked = subcommands[2] === 'true'
    }
    const envValue = await ux.prompt(`What is the value of ${subcommands[1]}`, { type: 'mask' })
    await api.environmentVariables.add(subcommands[1], envValue, locked)
    this.log(`Environment variable ${subcommands[1]} added.`)
  }
}
