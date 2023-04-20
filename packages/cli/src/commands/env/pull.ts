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
      name: 'filename',
      required: false,
      description: 'env filename',
      default: '.env',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { flags, argv } = await this.parse(EnvPull)
    const { force } = flags
    const args = argv as string[]

    if (args.length > 1) {
      throw new Error('Too many arguments. Please use "checkly env pull filename"')
    }

    const filename = args[0]
    const exists = fs.existsSync(filename)
    // check if filename exists and ask for confirmation to overwrite if it does
    if (exists && !force) {
      const { confirm } = await prompt([{
        name: 'confirm',
        type: 'confirm',
        message: `Found existing file ${filename}. Do you want to overwrite?`,
      }])
      if (!confirm) {
        this.log('Cancelled. No changes made.')
        return
      }
    }

    const { data: environmentVariables } = await api.environmentVariables.getAll()
    // create an file in current directory and save the env vars there
    const env = CONTENTS_PREFIX + environmentVariables.map(({ key, value }) => `${key}=${escapeValue(value)}`).join('\n') + '\n'

    fs.writeFile(filename, env, (err) => {
      if (err) {
        throw new Error(err.message)
      }
    })
    this.log(`Success! ${filename} file ${exists ? 'updated' : 'created'}`)
  }
}
