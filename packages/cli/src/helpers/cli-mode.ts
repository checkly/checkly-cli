import { existsSync } from 'node:fs'

export type CliMode = 'interactive' | 'ci' | 'agent'

const VALID_CLI_MODES: ReadonlySet<string> = new Set(['interactive', 'ci', 'agent'])

const AGENT_OPERATORS: ReadonlySet<string> = new Set([
  'claude-code', 'cursor', 'windsurf', 'aider', 'github-copilot',
  'cline', 'codex-cli', 'gemini-cli', 'opencode', 'claude-cowork',
  'vscode-agent', 'github-copilot-cli', 'amp', 'goose', 'antigravity',
  'augment-cli', 'android-studio-agent', 'kiro-agent', 'trae', 'devin', 'jules',
  'github-agentic-workflow', 'pi', 'agent',
])

const CI_OPERATORS: ReadonlySet<string> = new Set([
  'github-actions', 'gitlab-ci', 'ci',
])

const EXPLICIT_AGENT_ALIASES: Readonly<Record<string, string>> = {
  'claude': 'claude-code',
  'cowork': 'claude-cowork',
  'codex': 'codex-cli',
  'openai-codex': 'codex-cli',
  'cursor-cli': 'cursor',
  'gemini': 'gemini-cli',
  'copilot': 'github-copilot',
  'copilot-cli': 'github-copilot-cli',
  'github-copilot-vscode-agent': 'vscode-agent',
  'github_copilot_vscode_agent': 'vscode-agent',
  'augment': 'augment-cli',
}

const DISABLED_AGENT_VALUES: ReadonlySet<string> = new Set(['0', 'false', 'no', 'off'])
const GENERIC_AGENT_VALUES: ReadonlySet<string> = new Set(['1', 'true', 'yes', 'on'])
const RESERVED_OPERATOR_NAMES: ReadonlySet<string> = new Set(['manual'])
const VALID_OPERATOR_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/

function normalizeExplicitAgent (value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || DISABLED_AGENT_VALUES.has(normalized)) return undefined
  if (GENERIC_AGENT_VALUES.has(normalized)) return 'agent'
  if (RESERVED_OPERATOR_NAMES.has(normalized) || !VALID_OPERATOR_NAME.test(normalized)) return 'agent'
  return EXPLICIT_AGENT_ALIASES[normalized] ?? normalized.replaceAll('_', '-')
}

function detectExplicitAgent (): string | undefined {
  return normalizeExplicitAgent(process.env.AI_AGENT)
    ?? normalizeExplicitAgent(process.env.AGENT)
}

export function detectOperator (fileExists: (path: string) => boolean = existsSync): string {
  const explicitAgent = detectExplicitAgent()
  // Named generic markers identify wrappers that would otherwise look like their underlying agent.
  if (explicitAgent && explicitAgent !== 'agent') return explicitAgent

  // Cowork uses Claude Code's runtime too, so this more specific marker must win.
  if (process.env.CLAUDE_CODE_IS_COWORK) return 'claude-cowork'
  if (process.env.AMP_CURRENT_THREAD_ID) return 'amp'
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE) return 'claude-code'
  if (
    process.env.CURSOR_TRACE_ID
    || process.env.CURSOR_AGENT
    || process.env.CURSOR_EXTENSION_HOST_ROLE === 'agent-exec'
  ) return 'cursor'
  if (process.env.VSCODE_AGENT || process.env.COPILOT_AGENT) return 'vscode-agent'
  if (process.env.COPILOT_CLI) return 'github-copilot-cli'
  if (
    process.env.GITHUB_COPILOT
    || process.env.COPILOT_MODEL
    || process.env.COPILOT_ALLOW_ALL
    || process.env.COPILOT_GITHUB_TOKEN
  ) return 'github-copilot'
  if (process.env.AIDER) return 'aider'
  if (process.env.WINDSURF || process.env.WINDSURF_AGENT || process.env.CODEIUM_ENV) return 'windsurf'
  if (process.env.CLINE_ACTIVE) return 'cline'
  if (process.env.CODEX_SANDBOX || process.env.CODEX_CI || process.env.CODEX_THREAD_ID) return 'codex-cli'
  if (process.env.GEMINI_CLI) return 'gemini-cli'
  if (process.env.OPENCODE) return 'opencode'
  if (process.env.ANTIGRAVITY_AGENT) return 'antigravity'
  if (process.env.AUGMENT_AGENT) return 'augment-cli'
  if (process.env.ANDROID_STUDIO_AGENT) return 'android-studio-agent'
  if (process.env.KIRO_AGENT_PATH) return 'kiro-agent'
  if (process.env.TRAE_AI_SHELL_ID) return 'trae'
  if (process.env.GOOSE_TERMINAL) return 'goose'
  if (process.env.GITHUB_AW === 'true') return 'github-agentic-workflow'
  if (fileExists('/opt/.devin')) return 'devin'
  if (process.env.HOME === '/home/jules' && fileExists('/opt/environment_summary.sh')) return 'jules'
  if (process.env.PATH?.includes('/.pi/agent') || process.env.PATH?.includes('\\.pi\\agent')) return 'pi'

  // Boolean generic markers are deliberately checked after specific signals such as OPENCODE=1.
  if (explicitAgent === 'agent') return 'agent'

  // CI wins over broad IDE/workspace signals; strong agent signals above still win over CI.
  if (process.env.GITHUB_ACTIONS) return 'github-actions'
  if (process.env.GITLAB_CI) return 'gitlab-ci'
  if (process.env.CI) return 'ci'

  if (process.env.TERM_PROGRAM === 'vscode') return 'vscode'
  if (process.env.TERM_PROGRAM === 'kiro') return 'kiro'
  // REPL_ID identifies the whole workspace, not specifically Replit Agent, so it stays interactive.
  if (process.env.REPL_ID) return 'replit'
  // Firebase Studio markers identify the environment, not specifically an agent invocation.
  if (process.env.MONOSPACE_ENV || fileExists('/google/idx')) return 'firebase-studio'
  return 'manual'
}

export const OPERATOR_TO_PLATFORM: Record<string, string> = {
  'claude-code': 'claude',
  'cursor': 'cursor',
  'windsurf': 'windsurf',
  'github-copilot': 'github-copilot',
  'github-copilot-cli': 'github-copilot',
  'vscode-agent': 'github-copilot',
  'vscode': 'github-copilot',
  'cline': 'cline',
  'codex-cli': 'codex',
  'gemini-cli': 'gemini-cli',
  'aider': 'claude',
  'opencode': 'opencode',
  'claude-cowork': 'claude',
  'amp': 'amp',
  'goose': 'goose',
}

export function detectCliMode (fileExists: (path: string) => boolean = existsSync): CliMode {
  const envMode = process.env.CHECKLY_CLI_MODE
  if (envMode && VALID_CLI_MODES.has(envMode)) {
    return envMode as CliMode
  }

  const operator = detectOperator(fileExists)

  if (AGENT_OPERATORS.has(operator)) return 'agent'
  if (detectExplicitAgent()) return 'agent'
  if (CI_OPERATORS.has(operator)) return 'ci'
  return 'interactive'
}
