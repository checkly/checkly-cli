import { prompt } from 'inquirer'
import * as api from '../../rest/api'
import { Flags, Args } from '@oclif/core'
import { AuthCommand } from '../authCommand'
import { escapeValue } from '../../services/util'
import * as fs from 'fs'

const CONTENTS_PREFIX = '# Created by Checkly CLI\n'

export default class EnvPull extends AuthCommand {
  static hidden = false
  static description = 'Pull Checkly environment variables via env pull <filename>'

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
    const { flags, argv } = await this.parse(EnvPull)
    const { force } = flags
    const subcommands = argv as string[]

    if (subcommands.length > 4) {
      this.error('Too many arguments. Please use "checkly env ls" or "checkly env pull filename"')
      return
    }
    let filename = '.env'
    // overwrite filename if subcommands[1] is defined
    if (subcommands[1]) {
      filename = subcommands[1]
    }
    const exists = fs.existsSync(filename)
    // check if filename exists and ask for confirmation to overwrite if it does
    if (exists && !force) {
      const { confirm } = await prompt([{
        name: 'confirm',
        type: 'confirm',
        message: `Found existing file ${filename}. Do you want to overwrite?`,
      }])
      if (!confirm) {
        this.log('Canceled. No changes made.')
        return
      }
    }

    const { data: environmentVariables } = await api.environmentVariables.getAll()
    // create an file in current directory and save the env vars there
    const env = CONTENTS_PREFIX + environmentVariables.map(({ key, value }) => `${key}=${escapeValue(value)}`).join('\n') + '\n'

    fs.writeFile(filename, env, (err) => {
      if (err) {
        this.error(err.message)
      }
    })
    this.log(`Success! ${filename} file ${exists ? 'updated' : 'created'}`)
  }
}
