import { Flags } from '@oclif/core'
import path from 'node:path'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import { assetSelectorValue, formatDownloadedAssets, type DownloadedAssetRow } from '../../formatters/assets.js'
import {
  assertManifestSupportsDownload,
  archiveBundleAssets,
  assetManifestFiltersFromSelection,
  assetTypeSelectionFromFlag,
  assetTypes,
  defaultDownloadDirectory,
  destinationPathForAsset,
  downloadAssetToFile,
  fetchAssetManifest,
  hasArchiveEntries,
  isSingleArchiveBundle,
  resolveAssetSource,
  selectAssets,
} from '../../helpers/result-assets.js'

export default class AssetsDownload extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Download result assets.'

  static flags = {
    'check-id': Flags.string({
      description: 'Check ID for a scheduled check result.',
    }),
    'test-session-id': Flags.string({
      description: 'Test session ID for a test-session result.',
    }),
    'result-id': Flags.string({
      description: 'Check result ID or test-session result ID.',
      required: true,
    }),
    'type': Flags.string({
      description: 'Select assets by type.',
      options: assetTypes,
    }),
    'asset': Flags.string({
      description: 'Select an asset by exact Asset/Name value or glob.',
    }),
    'dir': Flags.string({
      description: 'Directory to write assets into.',
    }),
    'force': Flags.boolean({
      description: 'Overwrite existing files.',
      default: false,
    }),
    'skip-existing': Flags.boolean({
      description: 'Skip files that already exist.',
      default: false,
    }),
    'output': outputFlag({ default: 'table', options: ['table', 'json'] }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(AssetsDownload)
    this.style.outputFormat = flags.output
    const source = resolveAssetSource(flags)
    const type = assetTypeSelectionFromFlag(flags.type)
    const showProgress = flags.output !== 'json' && this.fancy && process.stdout.isTTY
    let progressStarted = false

    const startProgress = (message: string) => {
      if (!showProgress) return
      this.style.actionStart(message)
      progressStarted = true
    }

    const setProgress = (message: string) => {
      if (!showProgress || !progressStarted) return
      this.style.actionStatus(message)
    }

    const stopProgress = (success: boolean) => {
      if (!showProgress || !progressStarted) return
      if (success) {
        this.style.actionSuccess()
      } else {
        this.style.actionFailure()
      }
      progressStarted = false
    }

    if (flags.force && flags['skip-existing']) {
      throw new Error('--force and --skip-existing are mutually exclusive.')
    }

    try {
      startProgress('Fetching asset manifest')
      const filters = assetManifestFiltersFromSelection({
        type,
        asset: flags.asset,
      })
      const manifest = await fetchAssetManifest(source, filters)
      assertManifestSupportsDownload(manifest, filters)
      const assets = selectAssets(manifest.assets, {
        type,
        asset: flags.asset,
      })
      const hasSelector = Boolean(flags.type || flags.asset)

      if (!hasSelector && !isSingleArchiveBundle(assets)) {
        throw new Error('Pass --type or --asset to select assets. Use --type all to download all assets.')
      }

      if (assets.length === 0) {
        stopProgress(true)
        if (flags.output === 'json') {
          this.log(JSON.stringify({ source, directory: null, files: [], warnings: [] }, null, 2))
          return
        }
        this.log('No matching assets found.')
        return
      }

      const directory = path.resolve(flags.dir ?? defaultDownloadDirectory(source))
      const rows: DownloadedAssetRow[] = []
      const directAssets = assets.filter(asset => !asset.archive)
      const archiveAssets = archiveBundleAssets(assets)
      const downloadTargets = [
        ...directAssets.map(asset => ({ asset, displayType: undefined })),
        ...archiveAssets.map(asset => ({ asset, displayType: 'archive' })),
      ]
      const warnings: string[] = []

      if (hasArchiveEntries(assets)) {
        warnings.push(
          'Selected assets include archive entries. Downloading the containing archive file; filters narrow the manifest list, not the archive bytes.',
        )
      }

      for (const [index, target] of downloadTargets.entries()) {
        const { asset, displayType } = target
        const filePath = destinationPathForAsset(directory, asset)
        const label = `${index + 1}/${downloadTargets.length} ${displayType ?? asset.type} ${assetSelectorValue(asset)}`
        let lastProgressUpdate = 0
        setProgress(`Downloading ${label}`)
        const status = await downloadAssetToFile(asset, filePath, {
          force: flags.force,
          skipExisting: flags['skip-existing'],
          onProgress: showProgress
            ? ({ downloadedBytes, totalBytes }) => {
                const now = Date.now()
                if (now - lastProgressUpdate < 250) return
                lastProgressUpdate = now
                setProgress(`Downloading ${label} ${formatDownloadBytes(downloadedBytes, totalBytes)}`)
              }
            : undefined,
        })
        setProgress(status === 'skipped' ? `Skipped ${label}` : `Downloaded ${label}`)
        rows.push({ status, path: filePath, asset, displayType })
      }
      stopProgress(true)

      if (flags.output === 'json') {
        this.log(JSON.stringify({ source, directory, files: rows, warnings }, null, 2))
        return
      }

      const output = [
        ...warnings.map(warning => `Warning: ${warning}`),
        formatDownloadedAssets(rows),
      ].filter(Boolean)
      this.log(output.join('\n\n'))
    } catch (err: any) {
      stopProgress(false)
      this.style.longError('Failed to download assets.', err)
      process.exitCode = 1
    }
  }
}

function formatDownloadBytes (downloadedBytes: number, totalBytes?: number): string {
  if (totalBytes === undefined) return formatBytes(downloadedBytes)
  return `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
}

function formatBytes (bytes: number): string {
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const rounded = value >= 10 ? value.toFixed(1) : value.toFixed(2)
  return `${rounded} ${units[unitIndex]}`
}
