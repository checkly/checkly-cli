import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import type { OutputFormat } from '../../formatters/render.js'
import {
  formatAssetListHeader,
  formatAssetListNextSteps,
  formatAssetManifestEntries,
  formatAssetManifestTree,
} from '../../formatters/assets.js'
import {
  assetManifestFiltersFromSelection,
  assetTypeSelectionFromFlag,
  assetTypes,
  fetchAssetManifest,
  filterAssetsBySelector,
  filterAssetsByType,
  resolveAssetSource,
} from '../../helpers/result-assets.js'

export default class AssetsList extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'List result assets.'

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
      description: 'Filter assets by type.',
      options: assetTypes,
      default: 'all',
    }),
    'asset': Flags.string({
      description: 'Filter assets by exact Asset/Name value or glob.',
    }),
    'view': Flags.string({
      description: 'Human output view. Ignored with --output json.',
      options: ['table', 'tree'],
      default: 'table',
    }),
    'output': outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(AssetsList)
    this.style.outputFormat = flags.output
    const source = resolveAssetSource(flags)
    const type = assetTypeSelectionFromFlag(flags.type)

    try {
      const filters = assetManifestFiltersFromSelection({
        type,
        asset: flags.asset,
      })
      const manifest = await fetchAssetManifest(source, filters)
      const assets = filterAssetsBySelector(
        filterAssetsByType(manifest.assets, type),
        flags.asset,
      )

      if (flags.output === 'json') {
        this.log(JSON.stringify({
          data: assets,
          pagination: {
            length: assets.length,
          },
        }, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      const output: string[] = []

      output.push(formatAssetListHeader({
        sourceType: source.kind,
        checkId: source.kind === 'check-result' ? source.checkId : undefined,
        testSessionId: source.kind === 'test-session-result' ? source.testSessionId : undefined,
        resultId: source.resultId,
        type,
        asset: flags.asset,
      }, assets, fmt))
      output.push('')

      if (assets.length === 0) {
        output.push('No assets found.')
      } else if (flags.view === 'tree') {
        output.push(formatAssetManifestTree(assets, fmt))
        output.push('')
        output.push(chalk.dim('Tip: use --view table to copy exact Asset values for download.'))
      } else {
        output.push(formatAssetManifestEntries(assets, fmt))
      }

      const nextSteps = formatAssetListNextSteps({
        sourceType: source.kind,
        checkId: source.kind === 'check-result' ? source.checkId : undefined,
        testSessionId: source.kind === 'test-session-result' ? source.testSessionId : undefined,
        resultId: source.resultId,
        type,
        asset: flags.asset,
      }, assets, fmt)
      if (nextSteps) {
        output.push('')
        output.push(nextSteps)
      }

      if (manifest.truncated) {
        const returned = manifest.entriesReturned ?? manifest.assets.length
        const total = manifest.entriesTotal == null ? 'unknown' : String(manifest.entriesTotal)
        output.push('')
        output.push(chalk.yellow(`Warning: asset manifest is truncated (${returned} of ${total} entries returned).`))
      }

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to list assets.', err)
      process.exitCode = 1
    }
  }
}
