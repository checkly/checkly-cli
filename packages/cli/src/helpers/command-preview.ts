export type CommandClassification = {
  readOnly: boolean
  destructive: boolean
  idempotent: boolean
}

export type CommandPreview = {
  command: string
  description: string
  changes: string[]
  flags: Record<string, unknown>
  args?: Record<string, unknown>
  classification: CommandClassification
}

export type AgentPreviewResponse = {
  status: 'confirmation_required' | 'dry_run'
  command: string
  description: string
  classification: CommandClassification
  changes: string[]
  confirmCommand: string
}

const OMITTED_FLAGS: ReadonlySet<string> = new Set(['output', 'force', 'dry-run'])

export function buildConfirmCommand (
  command: string,
  flags: Record<string, unknown>,
  args?: Record<string, unknown>,
): string {
  const parts = ['checkly', command]

  if (args) {
    for (const value of Object.values(args)) {
      parts.push(String(value))
    }
  }

  for (const [key, value] of Object.entries(flags)) {
    if (OMITTED_FLAGS.has(key)) continue

    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`--${key}="${item}"`)
      }
    } else if (typeof value === 'boolean') {
      parts.push(value ? `--${key}` : `--no-${key}`)
    } else {
      parts.push(`--${key}="${value}"`)
    }
  }

  parts.push('--force')
  return parts.join(' ')
}

export function formatPreviewForAgent (
  preview: CommandPreview,
  status: 'confirmation_required' | 'dry_run',
): AgentPreviewResponse {
  return {
    status,
    command: preview.command,
    description: preview.description,
    classification: preview.classification,
    changes: preview.changes,
    confirmCommand: buildConfirmCommand(preview.command, preview.flags, preview.args),
  }
}

export function formatPreviewForTerminal (preview: CommandPreview): string {
  const lines: string[] = []
  lines.push('This will:')
  for (const change of preview.changes) {
    lines.push(`  - ${change}`)
  }
  return lines.join('\n')
}
