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
    `  ${chalk.bold('npx checkly login')}         Log in or create a free account`,
    `  ${chalk.bold('npx checkly test --record')}  Dry run your checks and record results`,
    `  ${chalk.bold('npx checkly deploy')}        Deploy checks to Checkly`,
    '',
    chalk.dim('  Docs:  https://checklyhq.com/docs/cli'),
    chalk.dim('  Slack: https://checklyhq.com/slack'),
    '',
  ].join('\n')
}

const PLATFORM_HINTS: Record<string, string> = {
  'claude': 'Open Claude Code and paste the prompt to get started.',
  'cursor': 'Open Cursor and paste the prompt into the AI chat.',
  'windsurf': 'Open Windsurf and paste the prompt into Cascade.',
  'github-copilot': 'Open VS Code with Copilot and paste the prompt.',
  'gemini-cli': 'Open Gemini CLI and paste the prompt to get started.',
  'codex': 'Open Codex CLI and paste the prompt to get started.',
  'amp': 'Open Amp and paste the prompt to get started.',
}

export function agentFooter (platform: string | null): string {
  const hint = platform ? PLATFORM_HINTS[platform] : null

  const lines = [
    '',
    chalk.green.bold('You\'re ready to go!'),
    '',
  ]

  if (hint) {
    lines.push(`  ${hint}`)
  } else {
    lines.push('  Paste the prompt into your AI coding agent to get started.')
  }

  lines.push(
    '',
    chalk.dim('  Your agent will use the installed skill to create a tailored'),
    chalk.dim('  Checkly setup — config, checks, and dependencies — based on your project.'),
    '',
    chalk.dim('  Prefer to set up manually? Here are the commands:'),
    chalk.dim(`    ${chalk.bold('npx checkly login')}         Log in or create a free account`),
    chalk.dim(`    ${chalk.bold('npx checkly test --record')}  Dry run your checks`),
    chalk.dim(`    ${chalk.bold('npx checkly deploy')}        Deploy checks to Checkly`),
    '',
    chalk.dim('  Docs:  https://checklyhq.com/docs/cli'),
    chalk.dim('  Slack: https://checklyhq.com/slack'),
    '',
  )

  return lines.join('\n')
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
