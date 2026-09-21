import type { DiffEntry } from '../rest/projects.js'

export type CommandClassification = {
  readOnly: boolean
  destructive: boolean
  idempotent: boolean
}

/**
 * The subset of oclif's parse metadata we rely on: which flags were filled in from
 * `default:` rather than typed by the user. Pass `metadata.flags` from `this.parse()`.
 */
export type FlagMetadata = Record<string, { setFromDefault?: boolean } | undefined>

/**
 * A deploy plan in machine-readable form, next to the human-readable `changes`
 * lines that describe the same thing. Only `deploy` sets it.
 *
 * `planToken` is the plan's fingerprint: the `confirmCommand` passes it back so
 * the confirming run applies the plan that was shown here and refuses if
 * Checkly moved in between.
 */
export type CommandPlanPreview = {
  planToken: string
  diff: DiffEntry[]
}

/**
 * What an interactive terminal shows instead of the flat `changes` list: a
 * rendered plan (an overview of every resource the command touches, with a
 * diff per updated one) followed by the lines that still need saying — the
 * options the command runs with, which no overview row carries.
 *
 * `plan` is rendered on demand because only the interactive branch prints it;
 * a forced, dry-run or agent run never pays for the rendering, and an error
 * in it cannot break an unattended run.
 */
export type CommandTerminalPreview = {
  plan: () => string
  changes: string[]
  /**
   * Things the user can choose to do instead of applying the command, offered
   * as further choices of the prompt. Choosing one runs it and ends the
   * command without applying anything.
   */
  alternatives?: CommandAlternative[]
}

export type CommandAlternative = {
  /** The choice as the prompt lists it. */
  title: string
  run: () => Promise<void>
}

export type CommandPreview = {
  command: string
  description: string
  changes: string[]
  flags: Record<string, unknown>
  flagMetadata?: FlagMetadata
  args?: Record<string, unknown>
  classification: CommandClassification
  preview?: CommandPlanPreview
  terminal?: CommandTerminalPreview
  /** The yes/no question an interactive terminal asks. `Proceed?` when left out. */
  question?: string
}

export type AgentPreviewResponse = {
  status: 'confirmation_required' | 'dry_run'
  command: string
  description: string
  classification: CommandClassification
  changes: string[]
  confirmCommand: string
  /** Present for commands that compute a structured plan; `deploy` does. */
  preview?: CommandPlanPreview
}

const OMITTED_FLAGS: ReadonlySet<string> = new Set(['output', 'force', 'dry-run'])

/**
 * A flag value as it can appear inside the double quotes of the command this
 * returns. The command is meant to be run in a shell, and a value can come from
 * anywhere — a path the user typed, or a token the API returned — so a quote or
 * a backslash in one must not end the quoting and let the rest be read as shell
 * syntax.
 */
function quote (value: unknown): string {
  return String(value).replace(/([\\"$`])/g, '\\$1')
}

export function buildConfirmCommand (
  command: string,
  flags: Record<string, unknown>,
  args?: Record<string, unknown>,
  flagMetadata?: FlagMetadata,
): string {
  const parts = ['checkly', command]

  if (args) {
    for (const value of Object.values(args)) {
      parts.push(String(value))
    }
  }

  for (const [key, value] of Object.entries(flags)) {
    if (OMITTED_FLAGS.has(key)) continue
    if (value === undefined || value === null) continue
    // Defaults are not part of what the user asked for, and a default `false` renders as
    // `--no-x`, which only parses when the flag sets `allowNo: true`.
    if (flagMetadata?.[key]?.setFromDefault) continue

    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`--${key}="${quote(item)}"`)
      }
    } else if (typeof value === 'boolean') {
      parts.push(value ? `--${key}` : `--no-${key}`)
    } else {
      parts.push(`--${key}="${quote(value)}"`)
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
    confirmCommand: buildConfirmCommand(preview.command, preview.flags, preview.args, preview.flagMetadata),
    ...preview.preview ? { preview: preview.preview } : {},
  }
}

export function formatPreviewForTerminal (preview: CommandPreview): string {
  const changes = preview.terminal?.changes ?? preview.changes
  const lines: string[] = []
  if (preview.terminal !== undefined) {
    // The rendered plan ends in a blank line of its own.
    lines.push(preview.terminal.plan())
  }
  if (changes.length === 1) {
    lines.push(`This will ${changes[0]}`)
  } else {
    lines.push('This will:')
    for (const change of changes) {
      lines.push(`  - ${change}`)
    }
  }
  return lines.join('\n')
}
