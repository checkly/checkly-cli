import { Args, Flags } from '@oclif/core'
import fs from 'node:fs/promises'
import path from 'node:path'

import { AuthCommand } from '../authCommand.js'
import * as api from '../../rest/api.js'
import {
  resourceExportTypes,
  type ResourceCodeExportFile,
  type ResourceCodeExportRequest,
  type ResourceCodeExportResponse,
  type ResourceCodeExportTarget,
  type ResourceExportType,
} from '../../rest/resources.js'

const numericResourceTypes = new Set<ResourceExportType>([
  'alert-channel',
  'alert-channel-subscription',
  'check-group',
  'dashboard',
  'maintenance-window',
])

export default class ResourcesExport extends AuthCommand {
  static hidden = false
  static readOnly = true
  static destructive = false
  static idempotent = true
  static description = 'Export Checkly resources as Monitoring as Code constructs.'

  static args = {
    resource: Args.string({
      required: false,
      description: 'Resource to export, formatted as type:id, for example check:uuid.',
    }),
  }

  static flags = {
    'type': Flags.string({
      description: 'Resource type to export. Can be specified multiple times.',
      options: [...resourceExportTypes],
      multiple: true,
      delimiter: ',',
    }),
    'updated-after': Flags.string({
      description: 'Only export resources updated after this ISO-8601 timestamp.',
    }),
    'updated-within': Flags.string({
      description: 'Only export resources updated within a recent duration, for example 30m, 1h, or 7d.',
    }),
    'code-managed-only': Flags.boolean({
      description: 'Only export resources already linked to a Monitoring as Code project.',
      default: false,
    }),
    'project': Flags.string({
      description: 'Project logical ID used for code-managed filtering and metadata.',
    }),
    'output-dir': Flags.string({
      description: 'Directory to write exported files. Required for multi-resource or multi-file exports.',
    }),
    'force': Flags.boolean({
      description: 'Overwrite existing files when using --output-dir.',
      default: false,
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { flags, argv } = await this.parse(ResourcesExport)

    const resources = argv.map(value => parseResourceSpec(String(value)))
    const hasBulkSelector = Boolean(flags.type?.length || flags['updated-after'] || flags['updated-within'] || flags['code-managed-only'])

    if (resources.length === 0 && !hasBulkSelector) {
      throw new Error('Pass a resource specifier such as check:<id>, or use filters such as --type or --code-managed-only.')
    }

    if (resources.length > 0 && flags.type?.length) {
      throw new Error('Use either explicit resource specifiers or --type filters, not both.')
    }

    if (flags['updated-after'] && flags['updated-within']) {
      throw new Error('Use only one of --updated-after or --updated-within.')
    }

    if ((resources.length !== 1 || hasBulkSelector) && !flags['output-dir']) {
      throw new Error('Pass --output-dir when exporting multiple resources or using filters.')
    }

    const payload = buildExportRequest({
      resources,
      types: flags.type as ResourceExportType[] | undefined,
      updatedAfter: resolveUpdatedAfter(flags['updated-after'], flags['updated-within']),
      codeManagedOnly: flags['code-managed-only'],
      projectLogicalId: flags.project,
    })

    const result = await api.resources.exportCode(payload)

    writeResultDiagnostics(result)

    if (result.errors?.length) {
      process.exitCode = 1
    }

    if (result.files.length === 0) {
      writeStderr('No files exported.\n')
      return
    }

    writeUnmanagedWarnings(result)

    if (flags['output-dir']) {
      await writeFiles(flags['output-dir'], result.files, { force: flags.force })
      writeStderr(`Exported ${result.files.length} file${result.files.length === 1 ? '' : 's'} to ${path.resolve(flags['output-dir'])}\n`)
      return
    }

    if (result.files.length > 1) {
      throw new Error('Export returned multiple files. Pass --output-dir to write them safely.')
    }

    process.stdout.write(result.files[0].content)
  }
}

export function buildExportRequest (options: {
  resources: ResourceCodeExportTarget[]
  types?: ResourceExportType[]
  updatedAfter?: string
  projectLogicalId?: string
  codeManagedOnly?: boolean
}): ResourceCodeExportRequest {
  const payload: ResourceCodeExportRequest = {}

  if (options.resources.length > 0) {
    payload.resources = options.resources
  }

  if (options.types?.length) {
    payload.types = options.types
  }

  if (options.updatedAfter) {
    payload.updatedAfter = options.updatedAfter
  }

  if (options.projectLogicalId) {
    payload.projectLogicalId = options.projectLogicalId
  }

  if (options.codeManagedOnly) {
    payload.codeManagedOnly = true
  }

  return payload
}

export function parseResourceSpec (spec: string): ResourceCodeExportTarget {
  const separator = spec.indexOf(':')
  if (separator <= 0 || separator === spec.length - 1) {
    throw new Error(`Invalid resource specifier "${spec}". Use type:id, for example check:uuid.`)
  }

  const type = spec.slice(0, separator)
  const id = spec.slice(separator + 1)

  if (!isResourceExportType(type)) {
    throw new Error(`Unsupported resource type "${type}". Supported types: ${resourceExportTypes.join(', ')}.`)
  }

  if (numericResourceTypes.has(type)) {
    const parsed = Number(id)
    if (!Number.isInteger(parsed)) {
      throw new Error(`Resource ID "${id}" for ${type} must be an integer.`)
    }

    return { type, id: parsed }
  }

  return { type, id }
}

export function resolveUpdatedAfter (updatedAfter?: string, updatedWithin?: string): string | undefined {
  if (updatedAfter) {
    const date = new Date(updatedAfter)
    if (Number.isNaN(date.valueOf())) {
      throw new Error(`Invalid --updated-after value "${updatedAfter}". Use an ISO-8601 timestamp.`)
    }

    return date.toISOString()
  }

  if (updatedWithin) {
    return new Date(Date.now() - parseDurationMs(updatedWithin)).toISOString()
  }
}

function parseDurationMs (value: string): number {
  const match = /^(\d+)(m|h|d|w)$/.exec(value)
  if (!match) {
    throw new Error(`Invalid --updated-within value "${value}". Use a duration like 30m, 1h, or 7d.`)
  }

  const amount = Number(match[1])
  const unit = match[2] as 'm' | 'h' | 'd' | 'w'
  const multipliers: Record<typeof unit, number> = {
    m: 60_000,
    h: 60 * 60_000,
    d: 24 * 60 * 60_000,
    w: 7 * 24 * 60 * 60_000,
  }

  return amount * multipliers[unit]
}

function isResourceExportType (value: string): value is ResourceExportType {
  return (resourceExportTypes as readonly string[]).includes(value)
}

function writeResultDiagnostics (result: ResourceCodeExportResponse): void {
  for (const skipped of result.skipped ?? []) {
    writeStderr(`Skipped ${formatResourceLabel(skipped)}: ${skipped.reason}\n`)
  }

  for (const err of result.errors ?? []) {
    writeStderr(`Failed to export ${formatResourceLabel(err)}: ${err.message}\n`)
  }
}

function writeUnmanagedWarnings (result: ResourceCodeExportResponse): void {
  for (const resource of result.resources ?? []) {
    if (resource.codeManaged === false) {
      writeStderr(
        `Warning: ${formatResourceLabel(resource)} is not linked to this Monitoring as Code project. `
        + `Deploying it as-is may create a duplicate.\n`,
      )
    }
  }
}

function formatResourceLabel (resource: { type?: string, id?: string | number, name?: string }): string {
  const spec = resource.type && resource.id !== undefined
    ? `${resource.type}:${resource.id}`
    : 'resource'

  if (resource.name) {
    return `${spec} (${resource.name})`
  }

  return spec
}

function writeStderr (message: string): void {
  process.stderr.write(message)
}

async function writeFiles (
  outputDir: string,
  files: ResourceCodeExportFile[],
  options: { force: boolean },
): Promise<void> {
  const root = path.resolve(outputDir)

  for (const file of files) {
    const destination = resolveOutputPath(root, file.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, file.content, {
      encoding: 'utf8',
      flag: options.force ? 'w' : 'wx',
    })
  }
}

function resolveOutputPath (root: string, filePath: string): string {
  if (filePath.includes('\0')) {
    throw new Error(`Invalid export file path "${filePath}".`)
  }

  const normalized = path.normalize(filePath)
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`Export file path "${filePath}" must be relative to --output-dir.`)
  }

  return path.join(root, normalized)
}
