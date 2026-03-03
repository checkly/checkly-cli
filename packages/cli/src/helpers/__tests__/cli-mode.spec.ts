import { beforeEach, describe, expect, it } from 'vitest'
import { detectOperator, detectCliMode } from '../cli-mode'

const operatorEnvVars = [
  'CLAUDECODE', 'CURSOR_TRACE_ID', 'TERM_PROGRAM', 'GITHUB_COPILOT',
  'AIDER', 'WINDSURF', 'CODEIUM_ENV', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CI',
]

describe('detectOperator', () => {
  beforeEach(() => {
    for (const key of operatorEnvVars) delete process.env[key]
  })

  it('returns "manual" when no agent env vars are set', () => {
    expect(detectOperator()).toBe('manual')
  })

  it('detects Claude Code', () => {
    process.env.CLAUDECODE = '1'
    expect(detectOperator()).toBe('claude-code')
  })

  it('detects Cursor', () => {
    process.env.CURSOR_TRACE_ID = 'some-trace-id'
    expect(detectOperator()).toBe('cursor')
  })

  it('detects VS Code', () => {
    process.env.TERM_PROGRAM = 'vscode'
    expect(detectOperator()).toBe('vscode')
  })

  it('does not detect VS Code for other TERM_PROGRAM values', () => {
    process.env.TERM_PROGRAM = 'iTerm.app'
    expect(detectOperator()).toBe('manual')
  })

  it('detects GitHub Copilot', () => {
    process.env.GITHUB_COPILOT = '1'
    expect(detectOperator()).toBe('github-copilot')
  })

  it('detects Aider', () => {
    process.env.AIDER = '1'
    expect(detectOperator()).toBe('aider')
  })

  it('detects Windsurf via WINDSURF env var', () => {
    process.env.WINDSURF = '1'
    expect(detectOperator()).toBe('windsurf')
  })

  it('detects Windsurf via CODEIUM_ENV env var', () => {
    process.env.CODEIUM_ENV = 'production'
    expect(detectOperator()).toBe('windsurf')
  })

  it('detects GitHub Actions', () => {
    process.env.GITHUB_ACTIONS = 'true'
    expect(detectOperator()).toBe('github-actions')
  })

  it('detects GitLab CI', () => {
    process.env.GITLAB_CI = 'true'
    expect(detectOperator()).toBe('gitlab-ci')
  })

  it('detects generic CI', () => {
    process.env.CI = 'true'
    expect(detectOperator()).toBe('ci')
  })

  it('prioritizes Claude Code over CI', () => {
    process.env.CLAUDECODE = '1'
    process.env.CI = 'true'
    expect(detectOperator()).toBe('claude-code')
  })

  it('prioritizes GitHub Actions over generic CI', () => {
    process.env.GITHUB_ACTIONS = 'true'
    process.env.CI = 'true'
    expect(detectOperator()).toBe('github-actions')
  })
})

describe('detectCliMode', () => {
  beforeEach(() => {
    delete process.env.CHECKLY_CLI_MODE
    for (const key of operatorEnvVars) delete process.env[key]
  })

  it('returns "interactive" by default', () => {
    expect(detectCliMode()).toBe('interactive')
  })

  it('returns "agent" when operator is claude-code', () => {
    process.env.CLAUDECODE = '1'
    expect(detectCliMode()).toBe('agent')
  })

  it('returns "agent" when operator is cursor', () => {
    process.env.CURSOR_TRACE_ID = 'trace'
    expect(detectCliMode()).toBe('agent')
  })

  it('returns "agent" when operator is windsurf', () => {
    process.env.WINDSURF = '1'
    expect(detectCliMode()).toBe('agent')
  })

  it('returns "agent" when operator is aider', () => {
    process.env.AIDER = '1'
    expect(detectCliMode()).toBe('agent')
  })

  it('returns "agent" when operator is github-copilot', () => {
    process.env.GITHUB_COPILOT = '1'
    expect(detectCliMode()).toBe('agent')
  })

  it('returns "ci" when operator is github-actions', () => {
    process.env.GITHUB_ACTIONS = 'true'
    expect(detectCliMode()).toBe('ci')
  })

  it('returns "ci" when operator is gitlab-ci', () => {
    process.env.GITLAB_CI = 'true'
    expect(detectCliMode()).toBe('ci')
  })

  it('returns "ci" when operator is generic ci', () => {
    process.env.CI = 'true'
    expect(detectCliMode()).toBe('ci')
  })

  it('returns "interactive" for vscode (not an agent)', () => {
    process.env.TERM_PROGRAM = 'vscode'
    expect(detectCliMode()).toBe('interactive')
  })

  it('env var CHECKLY_CLI_MODE overrides auto-detection', () => {
    process.env.CLAUDECODE = '1'
    process.env.CHECKLY_CLI_MODE = 'interactive'
    expect(detectCliMode()).toBe('interactive')
  })

  it('env var CHECKLY_CLI_MODE=agent forces agent mode', () => {
    process.env.CHECKLY_CLI_MODE = 'agent'
    expect(detectCliMode()).toBe('agent')
  })

  it('env var CHECKLY_CLI_MODE=ci forces ci mode', () => {
    process.env.CHECKLY_CLI_MODE = 'ci'
    expect(detectCliMode()).toBe('ci')
  })

  it('ignores invalid CHECKLY_CLI_MODE values and falls back to auto-detect', () => {
    process.env.CHECKLY_CLI_MODE = 'bogus'
    expect(detectCliMode()).toBe('interactive')
  })
})
