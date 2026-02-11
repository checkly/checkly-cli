import { describe, it, expect, beforeEach } from 'vitest'
import { detectOperator } from '../api'

describe('detectOperator', () => {
  const envVarsToClean = [
    'CLAUDECODE',
    'CURSOR_TRACE_ID',
    'TERM_PROGRAM',
    'GITHUB_COPILOT',
    'AIDER',
    'WINDSURF',
    'CODEIUM_ENV',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'CI',
  ]

  beforeEach(() => {
    for (const key of envVarsToClean) {
      delete process.env[key]
    }
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
