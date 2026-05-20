import { Hook } from '@oclif/core'
import chalk from 'chalk'

const DOCS_URL = 'https://www.checklyhq.com/docs/cli/'

// eslint-disable-next-line require-await
const hook: Hook<'command_not_found'> = async function ({ config, id }) {
  this.error(`${chalk.yellow(id)} is not a ${config.bin} command.`, { exit: false as never })

  const skills = chalk.cyan.bold(`${config.bin} skills`)
  const help = chalk.cyan.bold(`${config.bin} help`)
  // Hook.Context exposes only `log` (stdout) and `warn` (which prefixes every
  // line with `›   Warning:`). We'd like to stderr but format things nicely.
  process.stderr.write([
    '',
    'Looking for help?',
    '',
    `Documentation:    ${DOCS_URL}`,
    `Agent workflows:  run ${skills}`,
    `CLI help:         run ${help}`,
    '',
  ].join('\n'))

  this.exit(127)
}

export default hook
