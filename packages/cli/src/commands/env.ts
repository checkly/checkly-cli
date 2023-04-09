import { prompt } from 'inquirer'
import * as api from '../rest/api'
import { Flags, Args, ux } from '@oclif/core'
import { AuthCommand } from './authCommand'
import * as fs from 'fs'

const CONTENTS_PREFIX = '# Created by Checkly CLI\n'

export default class Env extends AuthCommand {
  static hidden = false
  static description = 'Manage environment variables via env pull <filename>, env ls, env add <key> <locked>, env rm <key>'

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'force mode',
      default: false,
    }),
  }

  // hacking subcommands via args to achieve env ls or env pull commands
  // https://github.com/oclif/oclif/issues/113#issuecomment-753543939
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
    const { flags, argv } = await this.parse(Env)
    const { force } = flags
    const subcommands = argv as string[]

    if (subcommands.length > 4) {
      this.error('Too many arguments. Please use "checkly env ls" or "checkly env pull filename"')
      return
    }

    if (subcommands[0] === 'ls') {
      const { data: environmentVariables } = await api.environmentVariables.getAll()

      if (environmentVariables.length === 0) {
        this.log('No environment variables found.')
        return
      }
      this.log('Environment variables:')
      const env = environmentVariables.map(({ key, value }) => `${key}=${escapeValue(value)}`).join('\n')
      this.log(`${env}`)
    } else if (subcommands[0] === 'rm') {
      // rm env variable
      if (!subcommands[1]) {
        this.error('Please provide a variable key to delete')
        return
      }
      const envVariableKey = subcommands[1]
      // check if env variable exists
      const { data: environmentVariables } = await api.environmentVariables.getAll()
      const envVariable = environmentVariables.find(({ key }) => key === envVariableKey)
      if (!envVariable) {
        this.error(`Environment variable ${envVariableKey} not found.`)
        return
      }
      await api.environmentVariables.delete(subcommands[1])
      this.log(`Environment variable ${subcommands[1]} deleted.`)
    } else if (subcommands[0] === 'add') {
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
    } else if (subcommands[0] === 'pull') {
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
      fs.writeFile(filename, env, function (err) {
        if (err) return console.log(err)
      })
      this.log(`Success! ${filename} file ${exists ? 'updated' : 'created'}`)
    }
  }
}

function escapeValue (value: string | undefined) {
  return value
    ? value
      .replace(/\n/g, '\\n') // combine newlines (unix) into one line
      .replace(/\r/g, '\\r') // combine newlines (windows) into one line
    : ''
}
