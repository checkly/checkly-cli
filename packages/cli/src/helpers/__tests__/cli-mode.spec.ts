import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectOperator, detectCliMode } from '../cli-mode.js'

const operatorEnvVars = [
  'AI_AGENT', 'AGENT', 'CLAUDECODE', 'CLAUDE_CODE', 'CLAUDE_CODE_IS_COWORK',
  'AMP_CURRENT_THREAD_ID', 'CURSOR_TRACE_ID', 'CURSOR_AGENT', 'CURSOR_EXTENSION_HOST_ROLE',
  'TERM_PROGRAM', 'VSCODE_AGENT', 'COPILOT_AGENT', 'COPILOT_CLI', 'GITHUB_COPILOT',
  'COPILOT_MODEL', 'COPILOT_ALLOW_ALL', 'COPILOT_GITHUB_TOKEN', 'AIDER', 'WINDSURF',
  'WINDSURF_AGENT', 'CODEIUM_ENV', 'CLINE_ACTIVE', 'CODEX_SANDBOX', 'CODEX_CI',
  'CODEX_THREAD_ID', 'GEMINI_CLI', 'OPENCODE', 'ANTIGRAVITY_AGENT', 'AUGMENT_AGENT',
  'ANDROID_STUDIO_AGENT', 'KIRO_AGENT_PATH', 'TRAE_AI_SHELL_ID', 'GOOSE_TERMINAL',
  'GITHUB_AW', 'REPL_ID', 'MONOSPACE_ENV', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CI',
  'CHECKLY_CLI_MODE', 'HOME', 'PATH',
] as const

const originalEnv = Object.fromEntries(operatorEnvVars.map(key => [key, process.env[key]]))
const noAgentFiles = () => false

beforeEach(() => {
  for (const key of operatorEnvVars) delete process.env[key]
})

afterEach(() => {
  for (const key of operatorEnvVars) {
    const value = originalEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('detectOperator', () => {
  it('returns "manual" when no agent env vars are set', () => {
    expect(detectOperator(noAgentFiles)).toBe('manual')
  })

  it('detects Claude Code', () => {
    process.env.CLAUDECODE = '1'
    expect(detectOperator(noAgentFiles)).toBe('claude-code')
  })

  it('detects Cursor via CURSOR_TRACE_ID', () => {
    process.env.CURSOR_TRACE_ID = 'some-trace-id'
    expect(detectOperator(noAgentFiles)).toBe('cursor')
  })

  it('detects Cursor via CURSOR_AGENT', () => {
    process.env.CURSOR_AGENT = '1'
    expect(detectOperator(noAgentFiles)).toBe('cursor')
  })

  it('detects VS Code', () => {
    process.env.TERM_PROGRAM = 'vscode'
    expect(detectOperator(noAgentFiles)).toBe('vscode')
  })

  it('does not detect VS Code for other TERM_PROGRAM values', () => {
    process.env.TERM_PROGRAM = 'iTerm.app'
    expect(detectOperator(noAgentFiles)).toBe('manual')
  })

  it('detects GitHub Copilot', () => {
    process.env.GITHUB_COPILOT = '1'
    expect(detectOperator(noAgentFiles)).toBe('github-copilot')
  })

  it('detects Aider', () => {
    process.env.AIDER = '1'
    expect(detectOperator(noAgentFiles)).toBe('aider')
  })

  it('detects Windsurf via WINDSURF env var', () => {
    process.env.WINDSURF = '1'
    expect(detectOperator(noAgentFiles)).toBe('windsurf')
  })

  it('detects Windsurf via CODEIUM_ENV env var', () => {
    process.env.CODEIUM_ENV = 'production'
    expect(detectOperator(noAgentFiles)).toBe('windsurf')
  })

  it('detects GitHub Actions', () => {
    process.env.GITHUB_ACTIONS = 'true'
    expect(detectOperator(noAgentFiles)).toBe('github-actions')
  })

  it('detects GitLab CI', () => {
    process.env.GITLAB_CI = 'true'
    expect(detectOperator(noAgentFiles)).toBe('gitlab-ci')
  })

  it('detects Cline', () => {
    process.env.CLINE_ACTIVE = '1'
    expect(detectOperator(noAgentFiles)).toBe('cline')
  })

  it('detects Codex CLI via CODEX_SANDBOX', () => {
    process.env.CODEX_SANDBOX = '1'
    expect(detectOperator(noAgentFiles)).toBe('codex-cli')
  })

  it('detects Codex CLI via CODEX_THREAD_ID', () => {
    process.env.CODEX_THREAD_ID = 'thread-123'
    expect(detectOperator(noAgentFiles)).toBe('codex-cli')
  })

  it('detects Gemini CLI', () => {
    process.env.GEMINI_CLI = '1'
    expect(detectOperator(noAgentFiles)).toBe('gemini-cli')
  })

  it('detects OpenCode', () => {
    process.env.OPENCODE = '1'
    expect(detectOperator(noAgentFiles)).toBe('opencode')
  })

  it.each([
    { key: 'CLAUDE_CODE', value: '1', expected: 'claude-code' },
    { key: 'AMP_CURRENT_THREAD_ID', value: 'thread-123', expected: 'amp' },
    { key: 'CURSOR_EXTENSION_HOST_ROLE', value: 'agent-exec', expected: 'cursor' },
    { key: 'VSCODE_AGENT', value: '1', expected: 'vscode-agent' },
    { key: 'COPILOT_AGENT', value: '1', expected: 'vscode-agent' },
    { key: 'COPILOT_CLI', value: '1', expected: 'github-copilot-cli' },
    { key: 'COPILOT_MODEL', value: 'gpt-5', expected: 'github-copilot' },
    { key: 'WINDSURF_AGENT', value: '1', expected: 'windsurf' },
    { key: 'CODEX_CI', value: '1', expected: 'codex-cli' },
    { key: 'ANTIGRAVITY_AGENT', value: '1', expected: 'antigravity' },
    { key: 'AUGMENT_AGENT', value: '1', expected: 'augment-cli' },
    { key: 'ANDROID_STUDIO_AGENT', value: '1', expected: 'android-studio-agent' },
    { key: 'KIRO_AGENT_PATH', value: '/path/to/kiro-agent', expected: 'kiro-agent' },
    { key: 'TRAE_AI_SHELL_ID', value: 'shell-123', expected: 'trae' },
    { key: 'GOOSE_TERMINAL', value: '1', expected: 'goose' },
    { key: 'GITHUB_AW', value: 'true', expected: 'github-agentic-workflow' },
    { key: 'REPL_ID', value: 'workspace-123', expected: 'replit' },
  ])('detects $key as $expected', ({ key, value, expected }) => {
    process.env[key] = value
    expect(detectOperator(noAgentFiles)).toBe(expected)
    expect(detectCliMode(noAgentFiles)).toBe(key === 'REPL_ID' ? 'interactive' : 'agent')
  })

  it('detects named generic agent markers and normalizes known aliases', () => {
    process.env.AI_AGENT = ' github_copilot_vscode_agent '
    expect(detectOperator(noAgentFiles)).toBe('vscode-agent')

    delete process.env.AI_AGENT
    process.env.AGENT = 'goose'
    expect(detectOperator(noAgentFiles)).toBe('goose')
  })

  it('uses a specific agent marker over a boolean generic marker', () => {
    process.env.AGENT = '1'
    process.env.OPENCODE = '1'
    expect(detectOperator(noAgentFiles)).toBe('opencode')
  })

  it('uses a safe generic operator for invalid explicit agent names', () => {
    process.env.AI_AGENT = 'invalid\nheader'
    expect(detectOperator(noAgentFiles)).toBe('agent')
  })

  it('does not allow an explicit agent marker to report itself as manual', () => {
    process.env.AI_AGENT = 'manual'
    expect(detectOperator(noAgentFiles)).toBe('agent')
  })

  it('ignores explicitly disabled generic agent markers', () => {
    process.env.AI_AGENT = 'false'
    process.env.AGENT = '0'
    expect(detectOperator(noAgentFiles)).toBe('manual')
  })

  it('prioritizes Claude Cowork over its shared Claude Code marker', () => {
    process.env.CLAUDE_CODE_IS_COWORK = '1'
    process.env.CLAUDECODE = '1'
    expect(detectOperator(noAgentFiles)).toBe('claude-cowork')
  })

  it('detects Devin via its sandbox filesystem marker', () => {
    expect(detectOperator(path => path === '/opt/.devin')).toBe('devin')
  })

  it('detects Jules only when its user and VM marker agree', () => {
    process.env.HOME = '/home/jules'
    expect(detectOperator(path => path === '/opt/environment_summary.sh')).toBe('jules')
    expect(detectCliMode(path => path === '/opt/environment_summary.sh')).toBe('agent')
  })

  it('detects Pi from its agent path segment', () => {
    process.env.PATH = '/usr/bin:/home/user/.pi/agent/bin'
    expect(detectOperator(noAgentFiles)).toBe('pi')
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('detects Firebase Studio without claiming its terminal is agent-driven', () => {
    process.env.MONOSPACE_ENV = 'true'
    expect(detectOperator(noAgentFiles)).toBe('firebase-studio')
    expect(detectCliMode(noAgentFiles)).toBe('interactive')
  })

  it('detects generic CI', () => {
    process.env.CI = 'true'
    expect(detectOperator(noAgentFiles)).toBe('ci')
  })

  it('prioritizes Cline over VS Code (Cline is a VS Code extension)', () => {
    process.env.CLINE_ACTIVE = '1'
    process.env.TERM_PROGRAM = 'vscode'
    expect(detectOperator(noAgentFiles)).toBe('cline')
  })

  it('prioritizes Claude Code over CI', () => {
    process.env.CLAUDECODE = '1'
    process.env.CI = 'true'
    expect(detectOperator(noAgentFiles)).toBe('claude-code')
  })

  it('prioritizes GitHub Actions over generic CI', () => {
    process.env.GITHUB_ACTIONS = 'true'
    process.env.CI = 'true'
    expect(detectOperator(noAgentFiles)).toBe('github-actions')
  })

  it('prioritizes CI over broad IDE environment markers', () => {
    process.env.CI = 'true'
    process.env.TERM_PROGRAM = 'vscode'
    expect(detectOperator(noAgentFiles)).toBe('ci')
  })
})

describe('detectCliMode', () => {
  it('returns "interactive" by default', () => {
    expect(detectCliMode(noAgentFiles)).toBe('interactive')
  })

  it('returns "agent" when operator is claude-code', () => {
    process.env.CLAUDECODE = '1'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" when operator is cursor', () => {
    process.env.CURSOR_TRACE_ID = 'trace'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" when operator is windsurf', () => {
    process.env.WINDSURF = '1'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" when operator is aider', () => {
    process.env.AIDER = '1'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" when operator is github-copilot', () => {
    process.env.GITHUB_COPILOT = '1'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" when operator is cline', () => {
    process.env.CLINE_ACTIVE = '1'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" when operator is codex-cli', () => {
    process.env.CODEX_SANDBOX = '1'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" when operator is gemini-cli', () => {
    process.env.GEMINI_CLI = '1'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" when operator is opencode', () => {
    process.env.OPENCODE = '1'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" for current VS Code agent commands', () => {
    process.env.VSCODE_AGENT = '1'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" for custom explicit agent names', () => {
    process.env.AI_AGENT = 'my-company-agent'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('returns "agent" for Devin filesystem markers', () => {
    expect(detectCliMode(path => path === '/opt/.devin')).toBe('agent')
  })

  it('keeps a generic Replit workspace interactive', () => {
    process.env.REPL_ID = 'workspace-123'
    expect(detectCliMode(noAgentFiles)).toBe('interactive')
  })

  it('keeps a generic Kiro terminal interactive', () => {
    process.env.TERM_PROGRAM = 'kiro'
    expect(detectCliMode(noAgentFiles)).toBe('interactive')
  })

  it('returns "ci" when operator is github-actions', () => {
    process.env.GITHUB_ACTIONS = 'true'
    expect(detectCliMode(noAgentFiles)).toBe('ci')
  })

  it('returns "ci" when operator is gitlab-ci', () => {
    process.env.GITLAB_CI = 'true'
    expect(detectCliMode(noAgentFiles)).toBe('ci')
  })

  it('returns "ci" when operator is generic ci', () => {
    process.env.CI = 'true'
    expect(detectCliMode(noAgentFiles)).toBe('ci')
  })

  it('returns "interactive" for vscode (not an agent)', () => {
    process.env.TERM_PROGRAM = 'vscode'
    expect(detectCliMode(noAgentFiles)).toBe('interactive')
  })

  it('env var CHECKLY_CLI_MODE overrides auto-detection', () => {
    process.env.CLAUDECODE = '1'
    process.env.CHECKLY_CLI_MODE = 'interactive'
    expect(detectCliMode(noAgentFiles)).toBe('interactive')
  })

  it('env var CHECKLY_CLI_MODE=agent forces agent mode', () => {
    process.env.CHECKLY_CLI_MODE = 'agent'
    expect(detectCliMode(noAgentFiles)).toBe('agent')
  })

  it('env var CHECKLY_CLI_MODE=ci forces ci mode', () => {
    process.env.CHECKLY_CLI_MODE = 'ci'
    expect(detectCliMode(noAgentFiles)).toBe('ci')
  })

  it('ignores invalid CHECKLY_CLI_MODE values and falls back to auto-detect', () => {
    process.env.CHECKLY_CLI_MODE = 'bogus'
    expect(detectCliMode(noAgentFiles)).toBe('interactive')
  })
})
