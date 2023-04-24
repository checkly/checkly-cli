import { prompt } from 'inquirer'
import * as path from 'path'
import * as api from '../../rest/api'
import { Flags, Args } from '@oclif/core'
import { AuthCommand } from '../authCommand'
import { escapeValue } from '../../services/util'
import * as fs from 'fs/promises'

const CONTENTS_PREFIX = '# Created by Checkly CLI\n'

export default class EnvPull extends AuthCommand {
  static hidden = false
  static description = 'Pull Checkly environment variables via "checkly env pull <filename>".'

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Force to overwrite existing file.',
      default: false,
    }),
  }

  static args = {
    fileArgs: Args.string({
      name: 'filename',
      required: false,
      description: 'Filename of the generated file.',
      default: '.env',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { flags, argv } = await this.parse(EnvPull)
    const { force } = flags
    const args = argv as string[]

    if (args.length > 1) {
      throw new Error('Too many arguments. Please use "checkly env pull <filename>".')
    }

    const filepath = path.resolve(args[0])
    const filename = path.basename(filepath)
    const { data: environmentVariables } = await api.environmentVariables.getAll()
    // create an file in current directory and save the env vars there
    const env = CONTENTS_PREFIX + environmentVariables.map(({ key, value }) => `${key}=${escapeValue(value)}`).join('\n') + '\n'

    // wx will cause the write to fail if the file already exists
    // https://nodejs.org/api/fs.html#file-system-flags
    const flag = force ? 'w' : 'wx'
    try {
      await fs.writeFile(filepath, env, { flag })
    } catch (err: any) {
      // By catching EEXIST rather than checking fs.existsSync, we avoid a race condition when a file is created between writing and checking
      if (err.code === 'EEXIST') {
        const { confirm } = await prompt([{
          name: 'confirm',
          type: 'confirm',
          message: `Found existing file ${filename}. Do you want to overwrite?`,
        }])
        if (!confirm) {
          this.log('Cancelled. No changes made.')
          return
        }
        await fs.writeFile(filepath, env)
      }
      
    }
    this.log(`Success! Environment variables written to ${filename}.`)
  }
}
