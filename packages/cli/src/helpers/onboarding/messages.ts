import chalk from 'chalk'
import { wrap } from '../wrap'

// All output lines stay within 80 visible characters for split-view
// terminal compatibility.

const WARNING_WRAP_WIDTH = 80

// ─── Shared blocks (single source of truth) ────────────────────

function playwrightBlock (): string[] {
  return [
    '',
    chalk.cyan('  You have a Playwright test suite — you can also:'),
    '',
    `  ${chalk.bold('npx checkly pw-test')}`,
    chalk.dim('  Run Playwright tests on Checkly infrastructure'),
    '',
    chalk('  Install the ')
    + chalk.bold.cyan('Checkly Playwright Reporter')
    + chalk(' for'),
    chalk('  trace uploads:'),
    chalk.cyan('  https://checklyhq.com/docs/detect/')
    + chalk.cyan('testing/playwright-reporter/'),
  ]
}

function playwrightBlockDimmed (): string[] {
  return [
    '',
    chalk.dim('  Since you have Playwright, your agent can also:'),
    chalk.dim(`  ${chalk.bold('npx checkly pw-test')}`),
    chalk.dim('  Run Playwright tests on Checkly infrastructure'),
    '',
    chalk.dim(`  Install the ${chalk.bold('Checkly Playwright Reporter')}`),
    chalk.dim('  for trace uploads:'),
    chalk.cyan.dim('  https://checklyhq.com/docs/detect/'),
    chalk.cyan.dim('  testing/playwright-reporter/'),
  ]
}

function docsBlock (): string[] {
  return [
    '',
    chalk.dim('  Docs:  ')
    + chalk.dim.cyan('https://checklyhq.com/docs/cli'),
    chalk.dim('  Slack: ')
    + chalk.dim.cyan('https://checklyhq.com/slack'),
    '',
  ]
}

// ─── Exported message functions ─────────────────────────────────

export function greeting (version: string): string {
  const title = chalk.bold.hex('#0075FF')('checkly')
    + ' ' + chalk.dim(`v${version}`)
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
    `  ${chalk.bold('npx checkly login')}`,
    chalk.dim('  Log in or create a free account'),
    '',
    `  ${chalk.bold('npx checkly test --record')}`,
    chalk.dim('  Dry run your checks and record results'),
    '',
    `  ${chalk.bold('npx checkly deploy')}`,
    chalk.dim('  Deploy checks to Checkly'),
  ]

  if (hasPlaywright) {
    lines.push(...playwrightBlock())
  }

  lines.push(...docsBlock())
  return lines.join('\n')
}

const PLATFORM_HINTS: Record<string, string> = {
  'claude': 'Open Claude Code and paste the prompt.',
  'cursor': 'Open Cursor and paste into the AI chat.',
  'windsurf': 'Open Windsurf and paste into Cascade.',
  'github-copilot': 'Open VS Code with Copilot and paste.',
  'gemini-cli': 'Open Gemini CLI and paste the prompt.',
  'codex': 'Open Codex CLI and paste the prompt.',
  'amp': 'Open Amp and paste the prompt.',
}

export function agentFooter (
  platform: string | null,
  hasPlaywright: boolean = false,
  copiedPrompt: boolean = false,
): string {
  const hint = platform ? PLATFORM_HINTS[platform] : null

  const lines = [
    '',
    chalk.green.bold('You\'re ready to go!'),
    '',
  ]

  if (hint) {
    lines.push(`  ${hint}`)
  } else {
    if (copiedPrompt) {
      lines.push('  Paste the prompt into your AI agent.')
    } else {
      lines.push('  Copy the prompt above and paste it into your AI agent.')
    }
  }

  lines.push(
    '',
    chalk.dim('  Your agent will use the skill to create a'),
    chalk.dim('  tailored Checkly setup based on your project.'),
  )

  if (hasPlaywright) {
    lines.push(...playwrightBlockDimmed())
  }

  lines.push(
    '',
    chalk.dim('  Prefer to set up manually?'),
    chalk.dim(`  ${chalk.bold('npx checkly login')}`),
    chalk.dim(`  ${chalk.bold('npx checkly test --record')}`),
    chalk.dim(`  ${chalk.bold('npx checkly deploy')}`),
  )

  lines.push(...docsBlock())
  return lines.join('\n')
}

export function noSkillWarning (): string {
  return [
    '',
    chalk.yellow(wrap(
      'Note: without the skill, your agent won\'t have Checkly-specific knowledge.',
      { length: WARNING_WRAP_WIDTH, prefix: '  ' },
    )),
    '',
    chalk.dim('  You can install it later with:'),
    chalk.dim(`  ${chalk.bold('npx checkly skills install')}`),
    '',
  ].join('\n')
}

export function existingProjectFooter (
  hasPlaywright: boolean = false,
): string {
  const lines = [
    '',
    chalk.green.bold('  You\'re all set!'),
    '',
    `  ${chalk.bold('npx checkly test --record')}`,
    chalk.dim('  Run your checks locally'),
    '',
    `  ${chalk.bold('npx checkly deploy')}`,
    chalk.dim('  Deploy checks to Checkly'),
    '',
    `  ${chalk.bold('npx checkly skills')}`,
    chalk.dim('  View available agent actions'),
  ]

  if (hasPlaywright) {
    lines.push(...playwrightBlock())
  }

  lines.push(...docsBlock())
  return lines.join('\n')
}
