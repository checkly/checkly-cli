import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FixtureSandbox } from '../../testing/fixture-sandbox.js'

const execFileAsync = promisify(execFile)

// A ZIP containing report.bin with NUL and invalid UTF-8 bytes.
const archive = Buffer.from(
  'UEsDBBQAAAAAAAAAIVwYQ5RNBwAAAAcAAAAKAAAAcmVwb3J0LmJpbgD//oDDKApQSwECFAMUAAAAAAAAACFcGEOUTQcAAAAH'
  + 'AAAACgAAAAAAAAAAAAAAgAEAAAAAcmVwb3J0LmJpblBLBQYAAAAAAQABADgAAAAvAAAAAAA=',
  'base64',
)

describe('checkly api response bytes', () => {
  let sandbox: FixtureSandbox
  let baseURL: string
  const server = createServer((request, response) => {
    switch (request.url) {
      case '/redirect':
        response.writeHead(302, { location: '/binary' }).end()
        break
      case '/binary':
        response.writeHead(200, { 'content-type': 'application/zip' }).end(archive)
        break
      case '/binary-json':
        response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(Buffer.from([0x22, 0xff, 0x22]))
        break
      case '/json':
        response.writeHead(200, { 'content-type': 'application/json' }).end('{\n  "name": "Café"\n}')
        break
      case '/json-bom':
        response.writeHead(200, { 'content-type': 'application/json' }).end('\uFEFF{"name":"Café"}')
        break
      case '/text':
        response.writeHead(200, { 'content-type': 'text/plain' }).end('Café\n')
        break
      case '/empty':
        response.writeHead(204).end()
        break
      default:
        response.writeHead(404, { 'content-type': 'application/json' }).end('{ "message": "Not found" }')
    }
  })

  beforeAll(async () => {
    sandbox = await FixtureSandbox.create({})
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await sandbox.destroy()
  })

  function run (...args: string[]) {
    return execFileAsync(process.execPath, [sandbox.abspath('node_modules/checkly/bin/run.cjs'), 'api', ...args], {
      cwd: sandbox.root,
      encoding: 'buffer',
      env: {
        ...process.env,
        CHECKLY_SKIP_AUTH: '1',
        CHECKLY_API_KEY: 'test-key',
        CHECKLY_ACCOUNT_ID: 'test-account',
        CHECKLY_ENV: 'local',
        CHECKLY_API_URL: baseURL,
        CHECKLY_E2E_CLI_VERSION: '99.0.0',
        NO_PROXY: '127.0.0.1',
        no_proxy: '127.0.0.1',
      },
    })
  }

  it.each<[string, Buffer]>([
    ['/binary', archive],
    ['/redirect', archive],
    ['/binary-json', Buffer.from([0x22, 0xff, 0x22])],
  ])('preserves binary response bytes from %s', async (endpoint, expected) => {
    const { stdout } = await run(endpoint)
    expect(stdout).toEqual(expected)
  })

  it('keeps verbose diagnostics out of the binary response', async () => {
    const { stdout, stderr } = await run('/binary', '--verbose')
    expect(stdout).toEqual(archive)
    expect(stderr.toString()).toContain('< 200 OK')
  })

  it('includes headers before the unchanged binary body', async () => {
    const { stdout } = await run('/binary', '--include')
    const bodyOffset = stdout.indexOf('\n\n') + 2
    expect(stdout.subarray(0, bodyOffset).toString()).toContain('HTTP/1.1 200 OK\n')
    expect(stdout.subarray(bodyOffset)).toEqual(archive)
  })

  it.each([
    ['/json', '{"name":"Café"}\n'],
    ['/json-bom', '{"name":"Café"}\n'],
    ['/text', 'Café\n'],
    ['/empty', ''],
  ])('writes the expected response from %s', async (endpoint, expected) => {
    const { stdout } = await run(endpoint)
    expect(stdout).toEqual(Buffer.from(expected))
  })

  it('prints the JSON error body and HTTP hint before exiting with code 1', async () => {
    const result = await run('/missing').catch(error => error)
    expect(result).toMatchObject({
      code: 1,
      stdout: Buffer.from('{"message":"Not found"}\n'),
    })
    expect(result.stderr.toString()).toContain('Endpoint not found.')
  })
})
