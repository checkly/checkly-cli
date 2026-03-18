import chalk from 'chalk'

export function greeting (version: string): string {
  const title = chalk.bold.hex('#0075FF')('checkly') + ' ' + chalk.dim(`v${version}`)
  const tagline = 'Monitoring as code, AI-native.'

  return [
    '',
    `  ${title}`,
    `  ${tagline}`,
    '',
  ].join('\n')
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
