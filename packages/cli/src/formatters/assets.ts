import chalk from 'chalk'
import type { AssetManifestEntry } from '../rest/asset-manifests.js'
import {
  type ColumnDef,
  type OutputFormat,
  escapeMdCell,
  renderAdaptiveTable,
} from './render.js'

export function assetSelectorValue (asset: AssetManifestEntry): string {
  return asset.archive?.entryName ?? asset.name
}

function buildAssetColumns (format: OutputFormat): ColumnDef<AssetManifestEntry>[] {
  if (format === 'md') {
    return [
      { header: 'Type', value: asset => asset.type },
      { header: 'Name', value: asset => asset.name },
      { header: 'Asset', value: asset => assetSelectorValue(asset) },
      { header: 'Content Type', value: asset => asset.contentType ?? '-' },
    ]
  }

  return [
    {
      header: 'Type',
      width: 12,
      value: asset => asset.type,
    },
    {
      header: 'Name',
      minWidth: 16,
      maxWidth: 34,
      value: asset => asset.name,
    },
    {
      header: 'Asset',
      minWidth: 28,
      value: asset => assetSelectorValue(asset),
    },
    {
      header: 'Content Type',
      minWidth: 14,
      maxWidth: 28,
      value: asset => {
        const contentType = asset.contentType ?? '-'
        return asset.contentType ? contentType : chalk.dim(contentType)
      },
    },
  ]
}

export function formatAssetManifestEntries (assets: AssetManifestEntry[], format: OutputFormat): string {
  return renderAdaptiveTable(buildAssetColumns(format), assets, format)
}

export interface AssetListContext {
  sourceType: 'check-result' | 'test-session-result'
  checkId?: string
  testSessionId?: string
  resultId: string
  type?: string
  asset?: string
}

function plural (count: number, singular: string, pluralValue = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralValue}`
}

function summarizeStorage (assets: AssetManifestEntry[]) {
  const archiveUrls = new Set<string>()
  let archiveEntries = 0

  for (const asset of assets) {
    if (asset.archive) {
      archiveEntries += 1
      archiveUrls.add(asset.url)
    }
  }

  return {
    directAssets: assets.length - archiveEntries,
    archiveEntries,
    archiveUrlCount: archiveUrls.size,
  }
}

function formatTypeCounts (assets: AssetManifestEntry[]): string {
  const counts = new Map<string, number>()
  for (const asset of assets) {
    counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${type} ${count}`)
    .join(', ')
}

export function formatAssetListHeader (
  context: AssetListContext,
  assets: AssetManifestEntry[],
  format: OutputFormat,
): string {
  const lines: string[] = []
  const title = context.sourceType === 'check-result'
    ? 'Assets for check result'
    : 'Assets for test-session result'

  lines.push(format === 'md' ? `## ${title}` : chalk.bold(title))
  if (context.checkId) {
    lines.push(format === 'md' ? `- Check ID: ${context.checkId}` : `${chalk.dim('Check ID:')} ${context.checkId}`)
  }
  if (context.testSessionId) {
    lines.push(format === 'md'
      ? `- Test session ID: ${context.testSessionId}`
      : `${chalk.dim('Test session ID:')} ${context.testSessionId}`)
  }
  lines.push(format === 'md' ? `- Result ID: ${context.resultId}` : `${chalk.dim('Result ID:')} ${context.resultId}`)
  const filters = [`type=${context.type ?? 'all'}`]
  if (context.asset) {
    filters.push(`asset=${context.asset}`)
  }
  lines.push(format === 'md' ? `- Filter: ${filters.join(', ')}` : `${chalk.dim('Filter:')} ${filters.join(', ')}`)

  const typeCounts = formatTypeCounts(assets)
  const total = `${assets.length} asset${assets.length !== 1 ? 's' : ''}`
  lines.push(format === 'md'
    ? `- Showing: ${typeCounts ? `${total} (${typeCounts})` : total}`
    : `${chalk.dim('Showing:')} ${typeCounts ? `${total} (${typeCounts})` : total}`)

  const storage = summarizeStorage(assets)
  if (storage.archiveEntries > 0 && storage.directAssets === 0) {
    const archiveSummary = `${plural(storage.archiveEntries, 'file')} inside ${plural(storage.archiveUrlCount, 'archive')}`
    lines.push(format === 'md'
      ? `- Storage: ${archiveSummary}`
      : `${chalk.dim('Storage:')} ${archiveSummary}`)
    lines.push(format === 'md'
      ? '- Download: archive entries download as the containing archive; filters narrow this list, not the archive bytes.'
      : `${chalk.dim('Download:')} archive entries download as the containing archive; filters narrow this list, not the archive bytes.`)
  } else if (storage.archiveEntries > 0) {
    const storageSummary = [
      plural(storage.directAssets, 'direct file'),
      `${plural(storage.archiveEntries, 'file')} inside ${plural(storage.archiveUrlCount, 'archive')}`,
    ].join(', ')
    lines.push(format === 'md'
      ? `- Storage: ${storageSummary}`
      : `${chalk.dim('Storage:')} ${storageSummary}`)
    lines.push(format === 'md'
      ? '- Download: direct files can be downloaded individually; archive entries download as their containing archive.'
      : `${chalk.dim('Download:')} direct files can be downloaded individually; archive entries download as their containing archive.`)
  } else if (assets.length > 0) {
    lines.push(format === 'md'
      ? '- Download: use --type or --asset to download matching files.'
      : `${chalk.dim('Download:')} use --type or --asset to download matching files.`)
  }

  return lines.join('\n')
}

function shellQuote (value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`
}

function sourceFlags (context: AssetListContext): string {
  const flags = context.sourceType === 'check-result'
    ? [`--check-id ${context.checkId}`]
    : [`--test-session-id ${context.testSessionId}`]
  flags.push(`--result-id ${context.resultId}`)
  return flags.join(' ')
}

export function formatAssetListNextSteps (
  context: AssetListContext,
  assets: AssetManifestEntry[],
  format: OutputFormat,
): string {
  if (assets.length === 0) return ''

  const commandBase = `checkly assets download ${sourceFlags(context)}`
  const lines: string[] = []

  const storage = summarizeStorage(assets)
  if (storage.archiveEntries > 0 && storage.directAssets === 0 && storage.archiveUrlCount === 1) {
    lines.push('Next:')
    lines.push(`  Download archive: ${commandBase}`)
    lines.push(`  Inspect entries:   checkly assets list ${sourceFlags(context)} --asset ${shellQuote('<glob-or-asset>')}`)
  } else {
    lines.push('Next:')
    const selector = context.asset
      ? ` --asset ${shellQuote(context.asset)}`
      : context.type && context.type !== 'all'
        ? ` --type ${context.type}`
        : ' --asset <Asset>'
    lines.push(`  Download files: ${commandBase}${selector}`)
  }

  if (format === 'md') {
    return lines.join('\n')
  }

  return lines
    .map(line => chalk.dim(line))
    .join('\n')
}

interface AssetTreeNode {
  children: Map<string, AssetTreeNode>
  assets: AssetManifestEntry[]
}

function createTreeNode (): AssetTreeNode {
  return { children: new Map(), assets: [] }
}

function assetPathSegments (asset: AssetManifestEntry): string[] {
  const selector = assetSelectorValue(asset)
  const segments = selector.split(/[\\/]+/).filter(Boolean)
  return segments.length > 0 ? segments : [asset.name]
}

function insertAsset (root: AssetTreeNode, asset: AssetManifestEntry): void {
  let node = root
  const segments = assetPathSegments(asset)
  for (const segment of segments) {
    let child = node.children.get(segment)
    if (!child) {
      child = createTreeNode()
      node.children.set(segment, child)
    }
    node = child
  }
  node.assets.push(asset)
}

function leafLabel (segment: string, assets: AssetManifestEntry[], format: OutputFormat): string {
  if (assets.length === 0) return `${segment}/`

  const labels = assets
    .map(asset => {
      const contentType = asset.contentType ? ` ${asset.contentType}` : ''
      return `${asset.type}${contentType}`
    })
    .join('; ')

  return format === 'md'
    ? `${segment} (${labels})`
    : `${segment} ${chalk.dim(`(${labels})`)}`
}

function renderTreeNode (node: AssetTreeNode, format: OutputFormat, depth = 0): string[] {
  const lines: string[] = []
  const entries = [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b))

  for (const [segment, child] of entries) {
    const indent = '  '.repeat(depth)
    lines.push(`${indent}${leafLabel(segment, child.assets, format)}`)
    lines.push(...renderTreeNode(child, format, depth + 1))
  }

  return lines
}

export function formatAssetManifestTree (assets: AssetManifestEntry[], format: OutputFormat): string {
  const root = createTreeNode()
  for (const asset of assets) {
    insertAsset(root, asset)
  }

  const tree = renderTreeNode(root, format)
  if (format === 'md') {
    return ['```text', ...tree.map(line => escapeMdCell(line)), '```'].join('\n')
  }
  return tree.join('\n')
}

export interface DownloadedAssetRow {
  status: 'written' | 'skipped'
  path: string
  asset: AssetManifestEntry
  displayType?: string
}

function buildDownloadedAssetColumns (): ColumnDef<DownloadedAssetRow>[] {
  return [
    {
      header: 'Type',
      width: 12,
      value: row => row.displayType ?? row.asset.type,
    },
    {
      header: 'Path',
      minWidth: 24,
      truncate: false,
      value: row => row.path,
    },
  ]
}

function buildDownloadedAssetStatusColumns (): ColumnDef<DownloadedAssetRow>[] {
  return [
    {
      header: 'Status',
      width: 10,
      value: row => row.status === 'written' ? chalk.green('written') : chalk.yellow('skipped'),
    },
    {
      header: 'Type',
      width: 12,
      value: row => row.displayType ?? row.asset.type,
    },
    {
      header: 'Path',
      minWidth: 24,
      truncate: false,
      value: row => row.path,
    },
  ]
}

export function formatDownloadedAssets (rows: DownloadedAssetRow[]): string {
  if (rows.length === 0) return ''

  if (rows.length === 1) {
    const [row] = rows
    const action = row.status === 'written' ? 'Downloaded' : 'Skipped existing'
    return [
      chalk.bold(`${action} ${row.displayType ?? row.asset.type} asset`),
      `${chalk.dim('Path:')} ${row.path}`,
    ].join('\n')
  }

  const written = rows.filter(row => row.status === 'written').length
  const skipped = rows.length - written
  const summary = [
    written > 0 ? `${written} downloaded` : undefined,
    skipped > 0 ? `${skipped} skipped` : undefined,
  ].filter(Boolean).join(', ')

  const columns = skipped > 0
    ? buildDownloadedAssetStatusColumns()
    : buildDownloadedAssetColumns()

  return [
    chalk.bold(`${rows.length} assets processed (${summary})`),
    renderAdaptiveTable(columns, rows, 'terminal'),
  ].join('\n')
}
