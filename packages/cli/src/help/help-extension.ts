import { Command, Help } from '@oclif/core'
import examples from './examples'
import { BaseCommandClass } from '../commands/baseCommand'

export default class ChecklyHelpClass extends Help {
  protected formatAllCommands (commands: Array<BaseCommandClass | Command.Loadable | Command.Cached>): string {
    if (commands.length === 0) return ''

    const coreCommands = commands.filter(c => c.coreCommand)
    const additionalCommands = commands.filter(c => !c.coreCommand)

    const format = (commands: Array<BaseCommandClass | Command.Loadable | Command.Cached>) => commands.map(c => {
      c.id = c.id.replace(/:/g, ' ')
      return [
        c.id,
        this.summary(c),
      ]
    })

    const reder = (commands: (string | undefined)[][]) =>
      this.renderList(commands, {
        spacer: '\n',
        stripAnsi: this.opts.stripAnsi,
        indentation: 2,
      })

    return this.section('CORE COMMANDS', reder(format(coreCommands))) +
      '\n' + '\n' +
      this.section('ADDITIONAL COMMANDS', reder(format(additionalCommands)))
  }

  public showRootHelp (): Promise<void> {
    const state = this.config.pjson?.oclif?.state
    if (state) {
      this.log(
        state === 'deprecated'
          ? `${this.config.bin} is deprecated`
          : `${this.config.bin} is in ${state}.\n`,
      )
    }

    this.log(this.formatRoot())
    this.log('')

    if (this.sortedCommands.length > 0) {
      this.log(this.formatAllCommands(this.sortedCommands))
      this.log('')
    }

    const examplesString = examples.reduce((accumulator, example) => {
      return accumulator + `\n- ${example.description}\n\n${this.indent('$ ' + example.command)}\n`
    }, '')

    this.log(this.section('EXAMPLES', examplesString))
    return Promise.resolve()
  }
}
