import path from 'node:path'
import axios, { type AxiosResponse } from 'axios'
import { randomUUID } from 'node:crypto'
import { constants, createWriteStream } from 'node:fs'
import { access, mkdir, rename, rm } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { minimatch } from 'minimatch'
import * as api from '../rest/api.js'
import { assignProxy } from '../services/proxy.js'
import type {
  AssetManifestFilters,
  AssetManifest,
  AssetManifestEntry,
} from '../rest/asset-manifests.js'
import { assetSelectorValue } from '../formatters/assets.js'

export const assetTypes = [
  'log',
  'trace',
  'video',
  'screenshot',
  'pcap',
  'report',
  'file',
  'all',
] as const

export type AssetTypeSelection = typeof assetTypes[number]

const assetTypeValues: readonly string[] = assetTypes

function isAssetTypeSelection (type: string): type is AssetTypeSelection {
  return assetTypeValues.includes(type)
}

export function assetTypeSelectionFromFlag (type?: string): AssetTypeSelection | undefined {
  if (!type) return

  if (isAssetTypeSelection(type)) {
    return type
  }

  throw new Error(`Unsupported asset type "${type}".`)
}

export interface AssetSourceFlags {
  'check-id'?: string
  'test-session-id'?: string
  'result-id'?: string
}

export type AssetSource =
  | { kind: 'check-result', checkId: string, resultId: string }
  | { kind: 'test-session-result', testSessionId: string, resultId: string }

export function resolveAssetSource (flags: AssetSourceFlags): AssetSource {
  if (!flags['result-id']) {
    throw new Error('--result-id is required.')
  }

  const hasCheckId = Boolean(flags['check-id'])
  const hasTestSessionId = Boolean(flags['test-session-id'])

  if (hasCheckId && hasTestSessionId) {
    throw new Error('Use exactly one of --check-id or --test-session-id, not both.')
  }

  if (!hasCheckId && !hasTestSessionId) {
    throw new Error('Use exactly one of --check-id or --test-session-id.')
  }

  if (flags['check-id']) {
    return { kind: 'check-result', checkId: flags['check-id'], resultId: flags['result-id'] }
  }

  return { kind: 'test-session-result', testSessionId: flags['test-session-id']!, resultId: flags['result-id'] }
}

export function assetManifestFiltersFromSelection (
  options: { type?: AssetTypeSelection, asset?: string },
): AssetManifestFilters | undefined {
  const filters: AssetManifestFilters = {}

  if (options.type && options.type !== 'all') {
    filters.type = options.type
  }

  const name = options.asset?.trim()
  if (name) {
    filters.name = name
  }

  return Object.keys(filters).length > 0 ? filters : undefined
}

export function fetchAssetManifest (
  source: AssetSource,
  filters?: AssetManifestFilters,
): Promise<AssetManifest> {
  if (source.kind === 'check-result') {
    return filters
      ? api.assetManifests.getForCheckResult(source.checkId, source.resultId, filters)
      : api.assetManifests.getForCheckResult(source.checkId, source.resultId)
  }

  return filters
    ? api.assetManifests.getForTestSessionResult(source.testSessionId, source.resultId, filters)
    : api.assetManifests.getForTestSessionResult(source.testSessionId, source.resultId)
}

export function filterAssetsByType (
  assets: AssetManifestEntry[],
  type?: AssetTypeSelection,
): AssetManifestEntry[] {
  if (!type || type === 'all') return assets
  return assets.filter(asset => asset.type === type)
}

export function hasGlobCharacters (selector: string): boolean {
  return /[*?[\]{}]/.test(selector)
}

const assetNameGlobOptions = {
  nocase: true,
  dot: true,
  matchBase: true,
  nobrace: true,
  noext: true,
}

export function filterAssetsBySelector (
  assets: AssetManifestEntry[],
  selector?: string,
): AssetManifestEntry[] {
  if (!selector) return assets

  if (hasGlobCharacters(selector)) {
    return assets.filter(asset =>
      minimatch(asset.archive?.entryName ?? '', selector, assetNameGlobOptions)
      || minimatch(asset.name, selector, assetNameGlobOptions),
    )
  }

  const normalizedSelector = selector.toLowerCase()
  return assets.filter(asset =>
    asset.archive?.entryName.toLowerCase() === normalizedSelector
    || asset.name.toLowerCase() === normalizedSelector,
  )
}

export function selectAssets (
  assets: AssetManifestEntry[],
  options: { type?: AssetTypeSelection, asset?: string },
): AssetManifestEntry[] {
  const byType = filterAssetsByType(assets, options.type)
  const selector = options.asset
  if (!selector) return byType

  if (hasGlobCharacters(selector)) {
    return filterAssetsBySelector(byType, selector)
  }

  const exactMatches = filterAssetsBySelector(byType, selector)

  if (exactMatches.length > 1) {
    const values = [...new Set(exactMatches.map(assetSelectorValue))]
    throw new Error(
      `--asset "${selector}" matches multiple assets:\n`
      + values.map(value => `  ${value}`).join('\n')
      + '\nCopy one Asset value from `checkly assets list` and pass it to --asset.',
    )
  }

  return exactMatches
}

export interface AssetStorageSummary {
  directAssets: number
  archiveEntries: number
  archiveUrls: string[]
}

export function summarizeAssetStorage (assets: AssetManifestEntry[]): AssetStorageSummary {
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
    archiveUrls: [...archiveUrls],
  }
}

export function isSingleArchiveBundle (assets: AssetManifestEntry[]): boolean {
  const summary = summarizeAssetStorage(assets)
  return summary.archiveEntries > 0 && summary.directAssets === 0 && summary.archiveUrls.length === 1
}

export function hasArchiveEntries (assets: AssetManifestEntry[]): boolean {
  return assets.some(asset => asset.archive)
}

function archiveFileNameFromUrl (url: string): string {
  try {
    const parsed = new URL(url, api.api.defaults?.baseURL)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const redirectIndex = segments.lastIndexOf('redirect')
    const keySegment = redirectIndex > 0 ? segments[redirectIndex - 1] : segments.at(-1)
    if (keySegment) {
      return path.posix.basename(decodeURIComponent(keySegment)) || 'assets.zip'
    }
  } catch {
    // Fall through to the deterministic default.
  }

  return 'assets.zip'
}

export function archiveBundleAssets (assets: AssetManifestEntry[]): AssetManifestEntry[] {
  const byUrl = new Map<string, AssetManifestEntry[]>()

  for (const asset of assets) {
    if (!asset.archive) continue
    byUrl.set(asset.url, [...(byUrl.get(asset.url) ?? []), asset])
  }

  return [...byUrl.entries()].map(([url, entries], index) => {
    const first = entries[0]
    const fileName = archiveFileNameFromUrl(url)
    const name = byUrl.size === 1 ? fileName : `${index + 1}-${fileName}`

    return {
      type: 'file',
      name,
      url,
      contentType: 'application/zip',
      source: first.source,
    }
  })
}

export function defaultDownloadDirectory (source: AssetSource): string {
  const prefix = source.kind === 'check-result' ? 'check-result' : 'test-session-result'
  return path.join('.', 'checkly-assets', `${prefix}-${source.resultId}`)
}

function sanitizePathSegment (segment: string): string {
  return segment
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\u0000-\u001F]/g, '_')
    .replace(/^\.+$/, '_')
    .trim()
}

export function destinationPathForAsset (directory: string, asset: AssetManifestEntry): string {
  const selector = assetSelectorValue(asset)
  const rawSegments = selector.split(/[\\/]+/)
  const safeSegments = rawSegments
    .map(sanitizePathSegment)
    .filter(segment => segment && segment !== '.' && segment !== '..')

  const relativePath = safeSegments.length > 0 ? path.join(...safeSegments) : 'asset'
  return path.join(directory, relativePath)
}

async function pathExists (filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function formatTruncatedManifestMessage (manifest: AssetManifest): string {
  const returned = manifest.entriesReturned ?? manifest.assets.length
  const total = manifest.entriesTotal == null ? 'unknown' : String(manifest.entriesTotal)
  return `Asset manifest is truncated (${returned} of ${total} entries returned).`
}

export function assertManifestSupportsDownload (
  manifest: AssetManifest,
  filters?: AssetManifestFilters,
): void {
  if (!manifest.truncated) return

  throw new Error(
    `${formatTruncatedManifestMessage(manifest)} Refusing to download because ${formatFilterScope(filters)}.\n`
    + 'Use a more specific --type and/or --asset filter, then retry the download.',
  )
}

function formatFilterScope (filters?: AssetManifestFilters): string {
  const parts = [
    filters?.type ? `--type ${filters.type}` : undefined,
    filters?.name ? `--asset ${filters.name}` : undefined,
  ].filter(Boolean)

  if (parts.length === 0) {
    return 'the manifest is incomplete'
  }

  return `the filtered manifest is still incomplete after applying ${parts.join(' and ')}`
}

export interface AssetDownloadProgress {
  downloadedBytes: number
  totalBytes?: number
}

export interface AssetDownloadOptions {
  force?: boolean
  skipExisting?: boolean
  onProgress?: (progress: AssetDownloadProgress) => void
}

function headerValue (headers: unknown, name: string): unknown {
  if (!headers || typeof headers !== 'object') return

  if ('get' in headers && typeof headers.get === 'function') {
    return headers.get(name)
  }

  const record = headers as Record<string, unknown>
  return record[name] ?? record[name.toLowerCase()]
}

function parseContentLength (headers: unknown): number | undefined {
  const value = headerValue(headers, 'content-length')
  if (Array.isArray(value)) return parseContentLength({ 'content-length': value[0] })
  if (typeof value !== 'string' && typeof value !== 'number') return

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function progressTransform (
  totalBytes: number | undefined,
  onProgress: AssetDownloadOptions['onProgress'],
): Transform | undefined {
  if (!onProgress) return

  let downloadedBytes = 0
  return new Transform({
    transform (chunk, _encoding, callback) {
      downloadedBytes += Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(chunk)
      onProgress({ downloadedBytes, totalBytes })
      callback(null, chunk)
    },
  })
}

function shouldUseAuthenticatedApiClient (url: string): boolean {
  try {
    const apiBaseUrl = api.api.defaults.baseURL
    if (!apiBaseUrl) return !URL.canParse(url)
    const resolvedUrl = new URL(url, apiBaseUrl)
    const resolvedApiUrl = new URL(apiBaseUrl)
    return resolvedUrl.origin === resolvedApiUrl.origin
  } catch {
    return !URL.canParse(url)
  }
}

function fetchAssetStream (assetUrl: string): Promise<AxiosResponse<NodeJS.ReadableStream>> {
  if (shouldUseAuthenticatedApiClient(assetUrl)) {
    return api.api.get<NodeJS.ReadableStream>(assetUrl, { responseType: 'stream' })
  }

  const config = assignProxy(assetUrl, { responseType: 'stream' })
  return axios.get<NodeJS.ReadableStream>(
    assetUrl,
    config,
  )
}

function temporaryDownloadPath (filePath: string): string {
  return path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`)
}

export async function downloadAssetToFile (
  asset: AssetManifestEntry,
  filePath: string,
  options: AssetDownloadOptions,
): Promise<'written' | 'skipped'> {
  const exists = await pathExists(filePath)
  if (exists) {
    if (options.skipExisting) return 'skipped'
    if (!options.force) {
      throw new Error(`Refusing to overwrite existing file. Use --force to overwrite or --skip-existing to keep it.\n${filePath}`)
    }
  }

  await mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = temporaryDownloadPath(filePath)

  try {
    const response = await fetchAssetStream(asset.url)
    const transform = progressTransform(parseContentLength(response.headers), options.onProgress)
    if (transform) {
      await pipeline(response.data, transform, createWriteStream(tempPath))
    } else {
      await pipeline(response.data, createWriteStream(tempPath))
    }
    await rename(tempPath, filePath)
  } catch (err) {
    await rm(tempPath, { force: true })
    throw err
  }

  return 'written'
}
