/* eslint no-console: 'off' */

import axios from 'axios'
import chalk from 'chalk'
import fullName from 'fullname'

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function getVersion (): Promise<string> {
  const { data } = await axios.get('https://registry.npmjs.org/@checkly/cli/latest')
  return data.version
}

export async function getUserGreeting (): Promise<string> {
  const name = await fullName()
  return name ? `Hi ${name}!` : 'Hi there!'
}

export function bail () {
  console.log(chalk.dim('Bailing, hope to see you again soon!\n'))
}

export async function header (version: string, greeting: string): Promise<void> {
  console.log(
    `${chalk.black.bgCyan.bold(' checkly ')} v${version} ${chalk.bold(
      'Build and Run Synthetics That Scale')}\n`,
  )
  await sleep(1000)
  console.log(`${greeting} Let's get you started on your ${chalk.green.bold('Monitoring-as-Code')} journey!\n`)
  await sleep(500)
}

export async function hint (prefix: string, text: string) {
  await sleep(100)
  if (process.stdout.columns < 80) {
    console.log(`${chalk.cyan('◼')}  ${chalk.cyan(prefix)}`)
    console.log(`${' '.repeat(3)}${chalk.dim(text)}\n`)
  } else {
    console.log(`${chalk.cyan('◼')}  ${chalk.cyan(prefix)} ${chalk.dim(text)}\n`)
  }
}

export async function footer (targetDir: string): Promise<void> {
  const max = process.stdout.columns
  const prefix = max < 80 ? ' ' : ' '.repeat(9)
  await sleep(200)
  console.log(
    `\n ${chalk.bgCyan(` ${chalk.black.bold('next')} `)}  ${chalk.bold(
      'All done. Time to get testing & monitoring with Checkly\n',
    )}`,
  )

  await sleep(200)
  console.log(
    `${prefix}> Enter your project directory using ${chalk.cyan(`cd ./${targetDir}`)}`,
  )
  await sleep(200)
  console.log(
    `${prefix}> Run ${chalk.cyan('npx checkly login')} to login to your Checkly account`,
  )
  await sleep(200)
  console.log(
    `${prefix}> Run ${chalk.cyan('npx checkly test')} to dry run your checks`,
  )
  await sleep(200)
  console.log(
    `${prefix}> Run ${chalk.cyan('npx checkly deploy')} to deploy your checks to the Checkly cloud`,
  )
  await sleep(200)
  console.log(`\n${prefix}Questions? Don't be a stranger, join the community at ${chalk.cyan('https://checklyhq.com/slack')}\n`)
}
