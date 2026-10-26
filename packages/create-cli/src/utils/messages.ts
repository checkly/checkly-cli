/* eslint no-console: 'off' */
import chalk from 'chalk'
import { getFullName } from './fullname.js'

// create-checkly is a wizard: all of its output is chatter, so it goes to
// stderr and stdout stays empty.

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function getUserGreeting (): Promise<string> {
  const name = await getFullName()
  return name ? `Hi ${name}!` : 'Hi there!'
}

export async function header (version: string, greeting: string): Promise<void> {
  console.error(
    `${chalk.black.bgCyan.bold(' checkly ')} v${version} ${chalk.bold(
      'Build and Run Synthetics That Scale')}\n`,
  )
  await sleep(1000)
  console.error(`${greeting} Let's get you started on your ${chalk.green.bold('monitoring as code')} journey!\n`)
  await sleep(500)
}

export async function hint (prefix: string, text: string) {
  await sleep(100)
  if (process.stderr.columns < 80) {
    console.error(`${chalk.cyan('◼')}  ${chalk.cyan(prefix)}`)
    console.error(`${' '.repeat(3)}${chalk.dim(text)}\n`)
  } else {
    console.error(`${chalk.cyan('◼')}  ${chalk.cyan(prefix)} ${chalk.dim(text)}\n`)
  }
}

export async function footer (targetDir?: string): Promise<void> {
  const max = process.stderr.columns
  const prefix = max < 80 ? ' ' : ' '.repeat(9)
  await sleep(200)
  console.error(
    `\n ${chalk.bgCyan(` ${chalk.black.bold('next')} `)}  ${chalk.bold(
      'All done. Time to get testing & monitoring with Checkly\n',
    )}`,
  )

  if (targetDir) {
    await sleep(200)
    console.error(
      `${prefix}> Enter your project directory using ${chalk.cyan(`cd ${targetDir}`)}`,
    )
  }
  await sleep(200)
  console.error(
    `${prefix}> Run ${chalk.cyan('npx checkly login')} to login to your Checkly account or create a free new account`,
  )
  await sleep(200)
  console.error(
    `${prefix}> Run ${chalk.cyan('npx checkly test')} to dry run your checks`,
  )
  await sleep(200)
  console.error(
    `${prefix}> Run ${chalk.cyan('npx checkly deploy')} to deploy your checks to the Checkly cloud`,
  )
  await sleep(200)
  console.error(`\n${prefix}Questions?\n`)
  console.error(`${prefix}- Check the docs at ${chalk.cyan('https://checklyhq.com/docs/cli')}`)
  console.error(`${prefix}- Join the Checkly Slack community at ${chalk.cyan('https://checklyhq.com/slack')}\n`)
}
