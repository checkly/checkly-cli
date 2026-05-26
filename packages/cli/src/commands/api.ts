import { Args, Flags } from '@oclif/core'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { AuthCommand } from './authCommand.js'
import { api } from '../rest/api.js'
import { parseFields } from '../helpers/api-fields.js'
import { paginateAll } from '../helpers/api-paginate.js'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH'])

export default class Api extends AuthCommand {
  static hidden = false
  static readOnly = false
  static destructive = true
  static idempotent = false
  static description = 'Make an authenticated HTTP request to the Checkly API.\n'
    + 'Pass-through for any endpoint — handles auth automatically.\n'
    + 'See https://www.checklyhq.com/docs/api for available endpoints.\n'
    + 'OpenAPI spec: https://api.checklyhq.com/openapi.json'

  static examples = [
    'checkly api /v1/checks',
    'checkly api /v1/checks -X GET --jq \'.[].name\'',
    'checkly api /v1/checks -X POST -F name=MyCheck -F activated:=true',
    'checkly api /v1/checks -X GET -f limit=5',
    'echo \'{"name":"New"}\' | checkly api /v1/checks -X POST --input -',
  ]

  static args = {
    endpoint: Args.string({
      description: 'API endpoint path (e.g. /v1/checks).',
      required: true,
    }),
  }

  static flags = {
    'method': Flags.string({
      char: 'X',
      description: 'HTTP method.',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
    'field': Flags.string({
      char: 'F',
      description: 'Add a field: key=value (string) or key:=value (parsed as JSON).',
      multiple: true,
      default: [],
    }),
    'raw-field': Flags.string({
      char: 'f',
      description: 'String parameter: key=value.',
      multiple: true,
      default: [],
    }),
    'header': Flags.string({
      char: 'H',
      description: 'Custom HTTP header: "Key: Value".',
      multiple: true,
      default: [],
    }),
    'jq': Flags.string({
      description: 'Filter JSON output with a jq expression (requires jq installed).',
    }),
    'input': Flags.string({
      description: 'Request body from file path, or "-" for stdin.',
    }),
    'paginate': Flags.boolean({
      description: 'Fetch all pages of results automatically.',
      default: false,
    }),
    'include': Flags.boolean({
      char: 'i',
      description: 'Include HTTP status and response headers in the output.',
      default: false,
    }),
    'verbose': Flags.boolean({
      description: 'Print request and response headers to stderr.',
      default: false,
    }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(Api)

    const hasFields = flags.field.length > 0 || flags['raw-field'].length > 0
    const method = (flags.method ?? (hasFields || flags.input ? 'POST' : 'GET')).toUpperCase()

    if (args.endpoint.startsWith('//') || /^[a-z][a-z\d+\-.]*:/i.test(args.endpoint)) {
      this.error('Endpoint must be a relative path (e.g. /v1/checks), not a URL.')
    }

    const endpoint = args.endpoint.startsWith('/') ? args.endpoint : `/${args.endpoint}`

    const baseUrl = api.defaults.baseURL
    if (baseUrl) {
      const resolved = new URL(endpoint, baseUrl)
      if (resolved.origin !== new URL(baseUrl).origin) {
        this.error('Endpoint must be a relative path (e.g. /v1/checks), not a URL.')
      }
    }

    const fields = hasFields ? parseFields(flags['raw-field'], flags.field) : undefined

    if (flags.input && hasFields) {
      this.error('Cannot use --input together with -f/--raw-field or -F/--field.')
    }

    if (flags.paginate && method !== 'GET') {
      this.error('--paginate is only supported for GET requests.')
    }

    let data: unknown
    if (flags.input) {
      const raw = flags.input === '-' ? await readStdin() : await readFile(flags.input, 'utf-8')
      try {
        data = JSON.parse(raw)
      } catch {
        data = raw
      }
    } else if (fields && WRITE_METHODS.has(method)) {
      data = fields
    }

    const params = fields && !WRITE_METHODS.has(method) ? fields : undefined

    const customHeaders: Record<string, string> = {}
    for (const h of flags.header) {
      const colonIndex = h.indexOf(':')
      if (colonIndex === -1) {
        this.error(`Invalid header format: "${h}". Expected "Key: Value".`)
      }
      customHeaders[h.slice(0, colonIndex).trim()] = h.slice(colonIndex + 1).trim()
    }

    const requestConfig = {
      method,
      url: endpoint,
      params,
      data,
      headers: customHeaders,
      validateStatus: () => true,
    }

    if (flags.verbose) {
      this.logToStderr(`> ${method} ${endpoint}`)
      for (const [k, v] of Object.entries(customHeaders)) {
        this.logToStderr(`> ${k}: ${v}`)
      }
      this.logToStderr('')
    }

    const response = await api.request(requestConfig)

    if (flags.verbose) {
      this.logToStderr(`< ${response.status} ${response.statusText}`)
      for (const [k, v] of Object.entries(response.headers)) {
        if (v !== undefined) {
          this.logToStderr(`< ${k}: ${v}`)
        }
      }
      this.logToStderr('')
    }

    let responseData = response.data

    if (flags.paginate) {
      responseData = await paginateAll(api, requestConfig, response, {
        warn: msg => this.logToStderr(`Warning: ${msg}`),
      })
    }

    if (flags.include) {
      this.log(`HTTP/1.1 ${response.status} ${response.statusText}`)
      for (const [k, v] of Object.entries(response.headers)) {
        if (v !== undefined) {
          this.log(`${k}: ${v}`)
        }
      }
      this.log()
    }

    if (responseData === undefined || responseData === null || responseData === '') {
      if (response.status >= 400) {
        this.exit(1)
      }
      return
    }

    const json = typeof responseData === 'string' ? responseData : formatJson(responseData)

    if (flags.jq) {
      await this.applyJq(json, flags.jq)
    } else {
      this.log(json)
    }

    if (response.status === 404) {
      this.logToStderr('Endpoint not found. See available endpoints at https://www.checklyhq.com/docs/api')
    } else if (response.status === 401) {
      this.logToStderr('Authentication failed — run "checkly login" or set CHECKLY_API_KEY.')
    } else if (response.status === 403) {
      this.logToStderr('Permission denied — verify your account role and API key scope.')
    }

    if (response.status >= 400) {
      this.exit(1)
    }
  }

  private applyJq (json: string, filter: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = execFile('jq', [filter], { encoding: 'utf-8' }, (error, stdout, stderr) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            reject(new Error(
              '--jq requires jq to be installed.\n'
              + 'Install it from https://jqlang.github.io/jq/',
            ))
            return
          }
          reject(new Error(`jq failed: ${stderr || error.message}`))
          return
        }
        if (stderr) {
          this.logToStderr(stderr)
        }
        if (stdout) {
          this.log(stdout.trimEnd())
        }
        resolve()
      })
      child.stdin?.write(json)
      child.stdin?.end()
    })
  }
}

function formatJson (data: unknown): string {
  if (process.stdout.isTTY) {
    return JSON.stringify(data, null, 2)
  }
  return JSON.stringify(data)
}

async function readStdin (): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf-8')
}
