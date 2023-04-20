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
      name: 'arguments',
      required: true,
      description: 'arguments to add environment variable <key> <locked>',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { argv } = await this.parse(EnvAdd)
    const subcommands = argv as string[]

    if (subcommands.length > 2) {
      throw new Error('Too many arguments. Please use "checkly env add <key> <locked>.')
    }

    // add env variable
    if (!subcommands[0]) {
      throw new Error('Please provide a variable key to add')
    }
    const envVariableName = subcommands[0]
    let locked = false
    if (subcommands[1]) {
      locked = subcommands[1] === 'true'
    }
    const envValue = await ux.prompt(`What is the value of ${envVariableName}`, { type: 'mask' })
    await api.environmentVariables.add(envVariableName, envValue, locked)
    this.log(`Environment variable ${envVariableName} added.`)
  }
}
