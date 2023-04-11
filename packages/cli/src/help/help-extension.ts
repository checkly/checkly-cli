import { Help } from '@oclif/core'
import * as chalk from 'chalk'
import examples from './examples'

export default class ChecklyHelpClass extends Help {
  public showRootHelp (): Promise<void> {
    // start copy & paste from standard showRootHelp implementation
    let rootTopics = this.sortedTopics
    let rootCommands = this.sortedCommands

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

    if (!this.opts.all) {
      rootTopics = rootTopics.filter(t => !t.name.includes(':'))
      rootCommands = rootCommands.filter(c => !c.id.includes(':'))
    }

    if (rootTopics.length > 0) {
      this.log(this.formatTopics(rootTopics))
      this.log('')
    }

    if (rootCommands.length > 0) {
      rootCommands = rootCommands.filter(c => c.id)
      this.log(this.formatCommands(rootCommands))
      this.log('')
    }
    // end

    const examplesString = examples.reduce((accumulator, example) => {
      return accumulator + `\n- ${example.description}\n\n${this.indent('$ ' + example.command)}\n`
    }, '')

    this.log(this.section('EXAMPLES', examplesString))
    return Promise.resolve()
  }
}
