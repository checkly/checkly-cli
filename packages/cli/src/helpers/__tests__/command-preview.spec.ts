import { describe, expect, it } from 'vitest'
import {
  formatPreviewForAgent,
  formatPreviewForTerminal,
  buildConfirmCommand,
} from '../command-preview'
import type { CommandPreview } from '../command-preview'

const samplePreview: CommandPreview = {
  command: 'incidents create',
  description: 'Create incident on status page',
  changes: [
    'Will create incident "DB outage" on status page "Acme Status"',
    'Affected services: checkout, payments',
    'Will notify subscribers',
  ],
  flags: {
    'status-page-id': 'sp-1',
    'title': 'DB outage',
    'services': ['checkout', 'payments'],
    'severity': 'major',
    'notify-subscribers': true,
    'output': 'table',
  },
  classification: { readOnly: false, destructive: false, idempotent: false },
}

describe('formatPreviewForAgent', () => {
  it('returns structured JSON for confirmation_required status', () => {
    const result = formatPreviewForAgent(samplePreview, 'confirmation_required')
    expect(result.status).toBe('confirmation_required')
    expect(result.command).toBe('incidents create')
    expect(result.description).toBe('Create incident on status page')
    expect(result.classification).toEqual({ readOnly: false, destructive: false, idempotent: false })
    expect(result.changes).toHaveLength(3)
    expect(result.confirmCommand).toContain('--force')
    expect(result.confirmCommand).toContain('incidents create')
  })

  it('returns structured JSON for dry_run status', () => {
    const result = formatPreviewForAgent(samplePreview, 'dry_run')
    expect(result.status).toBe('dry_run')
  })

  it('does not include output flag in confirmCommand', () => {
    const result = formatPreviewForAgent(samplePreview, 'confirmation_required')
    expect(result.confirmCommand).not.toContain('--output')
  })

  it('does not include dry-run flag in confirmCommand', () => {
    const preview: CommandPreview = {
      ...samplePreview,
      flags: { ...samplePreview.flags, 'dry-run': true },
    }
    const result = formatPreviewForAgent(preview, 'confirmation_required')
    expect(result.confirmCommand).not.toContain('--dry-run')
  })
})

describe('formatPreviewForTerminal', () => {
  it('formats changes as a bulleted list', () => {
    const result = formatPreviewForTerminal(samplePreview)
    expect(result).toContain('Will create incident "DB outage"')
    expect(result).toContain('Affected services')
    expect(result).toContain('Will notify subscribers')
  })
})

describe('buildConfirmCommand', () => {
  it('builds a CLI command string with --force', () => {
    const result = buildConfirmCommand('incidents create', {
      'title': 'DB outage',
      'status-page-id': 'sp-1',
    })
    expect(result).toBe('checkly incidents create --title="DB outage" --status-page-id="sp-1" --force')
  })

  it('repeats flags for array values', () => {
    const result = buildConfirmCommand('incidents create', {
      services: ['checkout', 'payments'],
    })
    expect(result).toContain('--services="checkout"')
    expect(result).toContain('--services="payments"')
  })

  it('renders boolean true flags as --flag', () => {
    const result = buildConfirmCommand('incidents create', {
      'notify-subscribers': true,
    })
    expect(result).toContain('--notify-subscribers')
    expect(result).not.toContain('--notify-subscribers=')
  })

  it('renders boolean false flags as --no-flag', () => {
    const result = buildConfirmCommand('incidents create', {
      'notify-subscribers': false,
    })
    expect(result).toContain('--no-notify-subscribers')
  })

  it('omits output, force, and dry-run flags', () => {
    const result = buildConfirmCommand('incidents create', {
      'output': 'table',
      'force': true,
      'dry-run': true,
      'title': 'Test',
    })
    expect(result).not.toContain('--output')
    expect(result).not.toContain('--dry-run')
    // Should have exactly one --force at the end
    expect(result).toBe('checkly incidents create --title="Test" --force')
  })

  it('includes args when provided', () => {
    const result = buildConfirmCommand('incidents update', { message: 'Fix deployed' }, { id: 'inc-123' })
    expect(result).toBe('checkly incidents update inc-123 --message="Fix deployed" --force')
  })
})
