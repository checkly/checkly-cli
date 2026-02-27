export type CliMode = 'interactive' | 'ci' | 'agent'

const VALID_CLI_MODES: ReadonlySet<string> = new Set(['interactive', 'ci', 'agent'])

const AGENT_OPERATORS: ReadonlySet<string> = new Set([
  'claude-code', 'cursor', 'windsurf', 'aider', 'github-copilot',
])

const CI_OPERATORS: ReadonlySet<string> = new Set([
  'github-actions', 'gitlab-ci', 'ci',
])

export function detectOperator (): string {
  if (process.env.CLAUDECODE) return 'claude-code'
  if (process.env.CURSOR_TRACE_ID) return 'cursor'
  if (process.env.TERM_PROGRAM === 'vscode') return 'vscode'
  if (process.env.GITHUB_COPILOT) return 'github-copilot'
  if (process.env.AIDER) return 'aider'
  if (process.env.WINDSURF || process.env.CODEIUM_ENV) return 'windsurf'
  if (process.env.GITHUB_ACTIONS) return 'github-actions'
  if (process.env.GITLAB_CI) return 'gitlab-ci'
  if (process.env.CI) return 'ci'
  return 'manual'
}

export function detectCliMode (): CliMode {
  const envMode = process.env.CHECKLY_CLI_MODE
  if (envMode && VALID_CLI_MODES.has(envMode)) {
    return envMode as CliMode
  }

  const operator = detectOperator()

  if (AGENT_OPERATORS.has(operator)) return 'agent'
  if (CI_OPERATORS.has(operator)) return 'ci'
  return 'interactive'
}
