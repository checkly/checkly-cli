import chalk from 'chalk'

function raccoonBanner (version: string): string {
  const b = chalk.hex('#0075FF')
  const d = chalk.hex('#002F66')
  const w = chalk.whiteBright

  // Raccoon face on blue rounded box — based on Checkly SVG logo
  // Features: white pointed ears, dark eye mask with white eye dots, dark nose, blue body
  const title = `  ${chalk.bold.hex('#0075FF')('checkly')} ${chalk.dim(`v${version}`)}`
  const tagline = '  Monitoring as code, AI-native.'

  return [
    '',
    `    ${w('▄')}          ${w('▄')}`,
    `   ${w('██')}${b('▄▄▄▄▄▄')}${w('██')}`,
    `   ${w('█')}${d('██')}${w('████')}${d('██')}${w('█')}${title}`,
    `   ${w('█')}${d('█')}${w('◉')}${d('█')}${w('██')}${d('█')}${w('◉')}${d('█')}${w('█')}`,
    `   ${b('█')}${d('███')}${w('████')}${d('███')}${b('█')}${tagline}`,
    `   ${b('██')}${d('█')}${w('█▀▀█')}${d('█')}${b('██')}`,
    `   ${b('████████████')}`,
    `   ${b(' ▀▀▀▀▀▀▀▀▀▀')}`,
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
