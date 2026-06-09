import { Flags } from '@oclif/core'
import path from 'node:path'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import { formatDownloadedAssets, type DownloadedAssetRow } from '../../formatters/assets.js'
import {
  assetTypes,
  defaultDownloadDirectory,
  destinationPathForAsset,
  downloadAssetToFile,
  fetchAssetManifest,
  isArchiveAsset,
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
    'extract': Flags.boolean({
      description: 'Extract supported archives instead of writing raw downloads.',
      default: false,
    }),
    'output': outputFlag({ default: 'table', options: ['table', 'json'] }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(AssetsDownload)
    this.style.outputFormat = flags.output
    const source = resolveAssetSource(flags)

    if (flags.force && flags['skip-existing']) {
      throw new Error('--force and --skip-existing are mutually exclusive.')
    }

    if (!flags.type && !flags.asset) {
      throw new Error('Pass --type or --asset to select assets. Use --type all to download all assets.')
    }

    try {
      const manifest = await fetchAssetManifest(source)
      const assets = selectAssets(manifest.assets, {
        type: flags.type as any,
        asset: flags.asset,
      })

      if (assets.length === 0) {
        if (flags.output === 'json') {
          this.log(JSON.stringify({ source, directory: null, files: [] }, null, 2))
          return
        }
        this.log('No matching assets found.')
        return
      }

      if (flags.extract) {
        const unsupported = assets.find(isArchiveAsset)
        if (unsupported) {
          throw new Error(
            '--extract is not supported for this asset shape yet. '
            + 'Download the raw asset without --extract and extract it locally.',
          )
        }
      }

      const directory = path.resolve(flags.dir ?? defaultDownloadDirectory(source))
      const rows: DownloadedAssetRow[] = []

      for (const asset of assets) {
        const filePath = destinationPathForAsset(directory, asset)
        const status = await downloadAssetToFile(asset, filePath, {
          force: flags.force,
          skipExisting: flags['skip-existing'],
        })
        rows.push({ status, path: filePath, asset })
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify({ source, directory, files: rows }, null, 2))
        return
      }

      this.log(formatDownloadedAssets(rows))
    } catch (err: any) {
      this.style.longError('Failed to download assets.', err)
      process.exitCode = 1
    }
  }
}
