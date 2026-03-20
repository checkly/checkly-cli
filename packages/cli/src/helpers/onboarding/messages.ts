import chalk from 'chalk'

// ─── Shared blocks (single source of truth) ──────────────────────────

function playwrightBlock (): string[] {
  return [
    '',
    chalk.cyan('  You have a Playwright test suite — you can also:'),
    '',
    `  ${chalk.bold('npx checkly pw-test')}       Run Playwright tests on Checkly infrastructure`,
    '',
    chalk('  You can also install the ') + chalk.bold.cyan('Checkly Playwright Reporter') + chalk(' to upload traces:'),
    chalk('    https://checklyhq.com/docs/detect/testing/playwright-reporter/'),
  ]
}

function playwrightBlockDimmed (): string[] {
  return [
    '',
    chalk.dim('  Since you have Playwright, your agent can also:'),
    chalk.dim(`    ${chalk.bold('npx checkly pw-test')}       Run Playwright tests on Checkly infrastructure`),
    chalk.dim(`    Install the ${chalk.bold('Checkly Playwright Reporter')} for trace uploads`),
    chalk.dim('    https://checklyhq.com/docs/detect/testing/playwright-reporter/'),
  ]
}

function docsBlock (): string[] {
  return [
    '',
    chalk.dim('  Docs:  https://checklyhq.com/docs/cli'),
    chalk.dim('  Slack: https://checklyhq.com/slack'),
    '',
  ]
}

// ─── Exported message functions ───────────────────────────────────────

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

export function footer (hasPlaywright: boolean = false): string {
  const lines = [
    '',
    chalk.green.bold('All done! Next steps:'),
    '',
    `  ${chalk.bold('npx checkly login')}         Log in or create a free account`,
    `  ${chalk.bold('npx checkly test --record')}  Dry run your checks and record results`,
    `  ${chalk.bold('npx checkly deploy')}        Deploy checks to Checkly`,
  ]

  if (hasPlaywright) {
    lines.push(...playwrightBlock())
  }

  lines.push(...docsBlock())
  return lines.join('\n')
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

export function agentFooter (platform: string | null, hasPlaywright: boolean = false): string {
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
    chalk.dim('  Dependencies are installed. Your agent will use the skill to create'),
    chalk.dim('  a tailored Checkly setup — config and checks — based on your project.'),
  )

  if (hasPlaywright) {
    lines.push(...playwrightBlockDimmed())
  }

  lines.push(
    '',
    chalk.dim('  Prefer to set up manually? Here are the commands:'),
    chalk.dim(`    ${chalk.bold('npx checkly login')}         Log in or create a free account`),
    chalk.dim(`    ${chalk.bold('npx checkly test --record')}  Dry run your checks`),
    chalk.dim(`    ${chalk.bold('npx checkly deploy')}        Deploy checks to Checkly`),
  )

  lines.push(...docsBlock())
  return lines.join('\n')
}

export function existingProjectFooter (hasPlaywright: boolean = false): string {
  const lines = [
    '',
    chalk.green.bold('  You\'re all set!'),
    '',
    `  ${chalk.bold('npx checkly test --record')}  Run your checks locally`,
    `  ${chalk.bold('npx checkly deploy')}        Deploy checks to Checkly`,
    `  ${chalk.bold('npx checkly skills')}        View available agent actions`,
  ]

  if (hasPlaywright) {
    lines.push(...playwrightBlock())
  }

  lines.push(...docsBlock())
  return lines.join('\n')
}

export function playwrightHint (): string {
  return [
    ...playwrightBlock(),
    '',
    chalk.cyan(`  An AI agent can help configure this — run ${chalk.bold('npx checkly skills install')}`),
    '',
  ].join('\n')
}
