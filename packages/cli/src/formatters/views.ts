import chalk from 'chalk'
import type { View, ViewCreator, ViewVisibility } from '../rest/views.js'
import { toViewPageOption } from '../helpers/views.js'
import {
  type ColumnDef,
  type DetailField,
  type OutputFormat,
  formatDate,
  renderAdaptiveTable,
  renderDetailFields,
} from './render.js'

function dash (format: OutputFormat): string {
  return format === 'terminal' ? chalk.dim('-') : '-'
}

function formatVisibility (visibility: ViewVisibility): string {
  return visibility.toLowerCase()
}

function formatCreator (createdBy: ViewCreator | null, format: OutputFormat): string {
  if (!createdBy) return dash(format)
  return createdBy.isMember ? createdBy.name : `${createdBy.name} (former member)`
}

function formatHidden (hidden: boolean, format: OutputFormat): string {
  if (format === 'md') return hidden ? 'yes' : 'no'
  return hidden ? chalk.yellow('yes') : chalk.dim('no')
}

function formatPermissions (view: View): string {
  const allowed = [
    view.canUpdate ? 'update' : undefined,
    view.canDelete ? 'delete' : undefined,
    view.canShare ? 'share' : undefined,
  ].filter(permission => permission !== undefined)
  return allowed.length > 0 ? allowed.join(', ') : 'none'
}

// --- List table ---

function buildViewColumns (format: OutputFormat): ColumnDef<View>[] {
  if (format === 'md') {
    return [
      { header: 'Name', value: v => v.name },
      { header: 'Page', value: v => toViewPageOption(v.page) },
      { header: 'Visibility', value: v => formatVisibility(v.visibility) },
      { header: 'Counter', value: (v, fmt) => v.counter ?? dash(fmt) },
      { header: 'Created by', value: (v, fmt) => formatCreator(v.createdBy, fmt) },
      { header: 'Hidden', value: (v, fmt) => formatHidden(v.hidden, fmt) },
      { header: 'ID', value: v => v.id },
    ]
  }

  return [
    {
      header: 'Name',
      minWidth: 12,
      maxWidth: 32,
      value: v => v.name,
    },
    {
      header: 'Page',
      width: 15,
      value: v => toViewPageOption(v.page),
    },
    {
      header: 'Visibility',
      width: 12,
      value: v => formatVisibility(v.visibility),
    },
    {
      header: 'Counter',
      width: 10,
      value: (v, fmt) => v.counter ?? dash(fmt),
    },
    {
      header: 'Created by',
      minWidth: 12,
      maxWidth: 32,
      value: (v, fmt) => formatCreator(v.createdBy, fmt),
    },
    {
      header: 'Hidden',
      width: 8,
      value: (v, fmt) => formatHidden(v.hidden, fmt),
    },
    {
      header: 'ID',
      value: v => chalk.dim(v.id),
    },
  ]
}

export function formatViewsList (views: View[], format: OutputFormat): string {
  return renderAdaptiveTable(buildViewColumns(format), views, format)
}

export function formatViewsCount (count: number): string {
  return chalk.dim(`${count} view${count !== 1 ? 's' : ''}`)
}

// --- Detail view for a single view ---

const viewDetailFields: DetailField<View>[] = [
  { label: 'Page', value: v => toViewPageOption(v.page) },
  { label: 'Visibility', value: v => formatVisibility(v.visibility) },
  { label: 'Counter', value: (v, fmt) => v.counter ?? dash(fmt) },
  { label: 'Created by', value: (v, fmt) => formatCreator(v.createdBy, fmt) },
  { label: 'Hidden', value: v => v.hidden ? 'yes' : 'no' },
  { label: 'Permissions', value: v => formatPermissions(v) },
  { label: 'Created', value: (v, fmt) => formatDate(v.created_at, fmt) },
  { label: 'Updated', value: (v, fmt) => formatDate(v.updated_at, fmt) },
  { label: 'ID', value: v => v.id },
]

interface FilterRow {
  filter: string
  value: string
}

function formatFilterValue (value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatFilterValue).join(', ') : '-'
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function buildFilterColumns (format: OutputFormat): ColumnDef<FilterRow>[] {
  if (format === 'md') {
    return [
      { header: 'Filter', value: r => r.filter },
      { header: 'Value', value: r => r.value },
    ]
  }

  return [
    { header: 'Filter', minWidth: 8, maxWidth: 16, value: r => r.filter },
    { header: 'Value', value: r => r.value },
  ]
}

export function formatViewDetail (view: View, format: OutputFormat): string {
  const lines: string[] = []
  lines.push(renderDetailFields(view.name, viewDetailFields, view, format))

  const filterRows = Object.entries(view.filters)
    .map(([filter, value]) => ({ filter, value: formatFilterValue(value) }))

  lines.push('')
  if (format === 'md') {
    lines.push('## Filters')
    lines.push('')
  } else {
    lines.push(chalk.bold('FILTERS'))
  }

  if (filterRows.length === 0) {
    lines.push(format === 'md' ? 'No filters.' : chalk.dim('No filters.'))
  } else {
    lines.push(renderAdaptiveTable(buildFilterColumns(format), filterRows, format))
  }

  return lines.join('\n')
}
