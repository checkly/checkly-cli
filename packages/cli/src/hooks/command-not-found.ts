import { Hook } from '@oclif/core'
import chalk from 'chalk'

const DOCS_URL = 'https://www.checklyhq.com/docs/cli/'

// eslint-disable-next-line require-await
const hook: Hook<'command_not_found'> = async function ({ config, id }) {
  this.warn(`${chalk.yellow(id)} is not a ${config.bin} command.`)

  const skills = chalk.cyan.bold(`${config.bin} skills`)
  const help = chalk.cyan.bold(`${config.bin} help`)
  // Hook.Context.log writes to stdout. We want stderr but with our own
  // formatting (no `›   Warning:` prefix on every line), so write directly.
  process.stderr.write([
    '',
    'Looking for help?',
    '',
    `CLI help:         run ${help}`,
    `Agent workflows:  run ${skills}`,
    `Documentation:    ${DOCS_URL}`,
    '',
  ].join('\n'))

  this.exit(127)
}

export default hook
