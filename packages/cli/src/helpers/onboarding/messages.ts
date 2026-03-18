import chalk from 'chalk'

const brand = chalk.hex('#0070EB')

function raccoonBanner (version: string): string {
  const b = brand
  const d = chalk.hex('#1A2B4A')
  const w = chalk.whiteBright

  // Raccoon peeking over blue rounded box — matches the Checkly logo
  const title = `  ${chalk.bold.hex('#0070EB')('checkly')} ${chalk.dim(`v${version}`)}`
  const tagline = `  ${'Let\'s set up Checkly for monitoring and testing.'}`

  return [
    '',
    `    ${w('▄▄')}      ${w('▄▄')}`,
    `   ${w('█')}${d('█')}${w('█')}${b('▄▄▄▄')}${w('█')}${d('█')}${w('█')}${title}`,
    `   ${w('█')}${d('██')}${b('████')}${d('██')}${w('█')}`,
    `    ${w('█')}${d('▀')}${w('▄▄')}${d('▀')}${w('█')}${tagline}`,
    `${b(' ▄▄▄▄▄')}${w('▀▄▄▀')}${b('▄▄▄▄▄')}`,
    `${b(' ██████████████')}`,
    `${b(' ▀▀▀▀▀▀▀▀▀▀▀▀▀▀')}`,
    '',
  ].join('\n')
}

export function greeting (version: string): string {
  return raccoonBanner(version)
}

export function footer (): string {
  return [
    '',
    chalk.green.bold('All done! Next steps:'),
    '',
    `  ${chalk.bold('npx checkly login')}       Log in or create a free account`,
    `  ${chalk.bold('npx checkly test --record')}  Dry run your checks and record results`,
    `  ${chalk.bold('npx checkly deploy')}      Deploy checks to Checkly`,
    '',
    chalk.dim('  Docs:  https://checklyhq.com/docs/cli'),
    chalk.dim('  Slack: https://checklyhq.com/slack'),
    '',
  ].join('\n')
}

export function playwrightHint (): string {
  return [
    '',
    chalk.cyan('  We noticed you have a Playwright config.'),
    chalk.cyan('  An AI coding agent can help configure Checkly to use your'),
    chalk.cyan(`  Playwright settings — run ${chalk.bold('npx checkly skills install')} to set up.`),
    '',
  ].join('\n')
}
