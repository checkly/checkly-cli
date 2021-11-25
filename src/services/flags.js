const { flags } = require('@oclif/command')

const config = require('../services/config')
const defaultOutput = config.data.get('output') || 'human'

module.exports = {
  output: flags.string({
    char: 'o',
    description: 'output type',
    default: defaultOutput,
    options: ['plain', 'human', 'json'],
  }),

  force: flags.boolean({
    char: 'f',
    description: 'force mode',
    default: false,
  }),
}
