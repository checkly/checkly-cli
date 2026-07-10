import { afterEach, describe, it, expect, beforeEach } from 'vitest'
import { detectOperator } from '../../helpers/cli-mode.js'

describe('detectOperator', () => {
  const envVarsToClean = [
    'AI_AGENT',
    'AGENT',
    'CLAUDECODE',
    'CLAUDE_CODE',
    'CLAUDE_CODE_IS_COWORK',
    'AMP_CURRENT_THREAD_ID',
    'CURSOR_TRACE_ID',
    'CURSOR_AGENT',
    'CURSOR_EXTENSION_HOST_ROLE',
    'TERM_PROGRAM',
    'VSCODE_AGENT',
    'COPILOT_AGENT',
    'COPILOT_CLI',
    'GITHUB_COPILOT',
    'COPILOT_MODEL',
    'COPILOT_ALLOW_ALL',
    'COPILOT_GITHUB_TOKEN',
    'AIDER',
    'WINDSURF',
    'WINDSURF_AGENT',
    'CODEIUM_ENV',
    'CLINE_ACTIVE',
    'CODEX_SANDBOX',
    'CODEX_CI',
    'CODEX_THREAD_ID',
    'GEMINI_CLI',
    'OPENCODE',
    'ANTIGRAVITY_AGENT',
    'AUGMENT_AGENT',
    'ANDROID_STUDIO_AGENT',
    'KIRO_AGENT_PATH',
    'TRAE_AI_SHELL_ID',
    'GOOSE_TERMINAL',
    'GITHUB_AW',
    'REPL_ID',
    'MONOSPACE_ENV',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'CI',
    'HOME',
    'PATH',
  ] as const
  const originalEnv = Object.fromEntries(envVarsToClean.map(key => [key, process.env[key]]))
  const noAgentFiles = () => false

  beforeEach(() => {
    for (const key of envVarsToClean) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of envVarsToClean) {
      const value = originalEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('returns "manual" when no agent env vars are set', () => {
    expect(detectOperator(noAgentFiles)).toBe('manual')
  })

  it('detects Claude Code', () => {
    process.env.CLAUDECODE = '1'
    expect(detectOperator(noAgentFiles)).toBe('claude-code')
  })

  it('detects Cursor', () => {
    process.env.CURSOR_TRACE_ID = 'some-trace-id'
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

  it('detects generic CI', () => {
    process.env.CI = 'true'
    expect(detectOperator(noAgentFiles)).toBe('ci')
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
})
