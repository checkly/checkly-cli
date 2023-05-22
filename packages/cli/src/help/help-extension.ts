import { Command, Help } from '@oclif/core'
import examples from './examples'
import { BaseCommandClass } from '../commands/baseCommand'
import { Topic } from '@oclif/core/lib/interfaces'

export default class ChecklyHelpClass extends Help {
  protected formatAllCommands (commands: Array<BaseCommandClass | Command.Loadable | Command.Cached>,
    topics: Array<Topic>): string {
    if (commands.length === 0) return ''

    const coreCommands = commands.filter(c => c.coreCommand)
    const additionalCommands = commands.filter(c => !c.coreCommand)

    const formatCommandsWithoutTopics = (commands: Array<BaseCommandClass | Command.Loadable | Command.Cached>) =>
      commands
        // discard commands with ':' indicating they are under a topic
        .filter(c => !c.id.includes(':') || c.coreCommand)
        .map(c => [c.id.replace(/:/g, ' '), this.summary(c)])

    const formatCommandsWithTopics = (commands: Array<BaseCommandClass | Command.Loadable | Command.Cached>) =>
      commands
        // discard commands with ':' indicating they are under a topic
        .filter(c => !c.id.includes(':'))
        .map(c => [c.id, this.summary(c)])
        .concat(topics.map(t => [t.name, t.description]))
        .sort(([a, x], [b, y]) => (a! < b!) ? -1 : 1)

    const reder = (commands: (string | undefined)[][]) =>
      this.renderList(commands, {
        spacer: '\n',
        stripAnsi: this.opts.stripAnsi,
        indentation: 2,
      })

    return this.section('CORE COMMANDS', reder(formatCommandsWithoutTopics(coreCommands))) +
      '\n' + '\n' +
      this.section('ADDITIONAL COMMANDS', reder(formatCommandsWithTopics(additionalCommands)))
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
      this.log(this.formatAllCommands(this.sortedCommands, this.sortedTopics))
      this.log('')
    }

    const examplesString = examples.reduce((accumulator, example) => {
      return accumulator + `\n- ${example.description}\n\n${this.indent('$ ' + example.command)}\n`
    }, '')

    this.log(this.section('EXAMPLES', examplesString))
    return Promise.resolve()
  }
}
