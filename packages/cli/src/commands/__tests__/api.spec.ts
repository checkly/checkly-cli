import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  api: {
    request: vi.fn(),
    defaults: { baseURL: 'https://api.checklyhq.com' },
  },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

import { api } from '../../rest/api.js'
import { execFile } from 'node:child_process'
import ApiCommand from '../api.js'

const mockConfig = {
  version: '1.0.0',
  runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
} as any

function createCommand (...argv: string[]) {
  const cmd = new ApiCommand(argv, mockConfig)
  cmd.log = vi.fn() as any
  cmd.logToStderr = vi.fn() as any
  cmd.exit = vi.fn((code: number) => {
    throw new Error(`EXIT_${code}`)
  }) as any
  return cmd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.request).mockResolvedValue({
    data: [{ id: '1', name: 'Test Check' }],
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  })
})

describe('checkly api', () => {
  describe('method resolution', () => {
    it('defaults to GET when no fields', async () => {
      const cmd = createCommand('/v1/checks')
      await cmd.run()
      expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET' }))
    })

    it('defaults to POST when fields are present', async () => {
      const cmd = createCommand('/v1/checks', '-F', 'name=Test')
      await cmd.run()
      expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }))
    })

    it('defaults to POST when --input is present', async () => {
      vi.mock('node:fs/promises', async importOriginal => {
        const actual = await importOriginal<typeof import('node:fs/promises')>()
        return { ...actual, readFile: vi.fn().mockResolvedValue('{"name":"Test"}') }
      })
      const cmd = createCommand('/v1/checks', '--input', 'body.json')
      await cmd.run()
      expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }))
    })

    it('respects explicit --method', async () => {
      const cmd = createCommand('/v1/checks', '-X', 'PATCH', '-F', 'name=Test')
      await cmd.run()
      expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'PATCH' }))
    })
  })

  describe('endpoint normalization', () => {
    it('passes through path starting with /', async () => {
      const cmd = createCommand('/v1/checks')
      await cmd.run()
      expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/v1/checks' }))
    })

    it('prepends / if missing', async () => {
      const cmd = createCommand('v1/checks')
      await cmd.run()
      expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/v1/checks' }))
    })

    it('rejects protocol-relative URLs', async () => {
      const cmd = createCommand('//evil.com/steal')
      await expect(cmd.run()).rejects.toThrow('Endpoint must be a relative path')
    })

    it('rejects absolute URLs', async () => {
      const cmd = createCommand('https://evil.com/steal')
      await expect(cmd.run()).rejects.toThrow('Endpoint must be a relative path')
    })

    it('rejects backslash-based host escape', async () => {
      const cmd = createCommand('\\evil.com\\steal')
      await expect(cmd.run()).rejects.toThrow('Endpoint must be a relative path')
    })
  })

  describe('fields', () => {
    it('sends -f fields as query params for GET', async () => {
      const cmd = createCommand('/v1/checks', '-X', 'GET', '-f', 'limit=5')
      await cmd.run()
      expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        params: { limit: '5' },
      }))
    })

    it('sends -F typed fields as JSON body for POST', async () => {
      const cmd = createCommand('/v1/checks', '-F', 'name=Test', '-F', 'activated:=true')
      await cmd.run()
      expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        data: { name: 'Test', activated: true },
      }))
    })
  })

  describe('custom headers', () => {
    it('passes custom headers via -H', async () => {
      const cmd = createCommand('/v1/checks', '-H', 'X-Custom: test-value')
      await cmd.run()
      expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
        headers: { 'X-Custom': 'test-value' },
      }))
    })
  })

  describe('error handling', () => {
    it('exits with code 1 on 4xx response', async () => {
      vi.mocked(api.request).mockResolvedValue({
        data: { message: 'Not found' },
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {} as any,
      })
      const cmd = createCommand('/v1/nonexistent')
      await expect(cmd.run()).rejects.toThrow('EXIT_1')
    })

    it('shows docs hint on 404', async () => {
      vi.mocked(api.request).mockResolvedValue({
        data: { message: 'Not found' },
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {} as any,
      })
      const cmd = createCommand('/v1/nonexistent')
      await expect(cmd.run()).rejects.toThrow('EXIT_1')
      expect(cmd.logToStderr).toHaveBeenCalledWith(
        expect.stringContaining('https://www.checklyhq.com/docs/api'),
      )
    })

    it('shows auth hint on 401', async () => {
      vi.mocked(api.request).mockResolvedValue({
        data: { message: 'Unauthorized' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: {} as any,
      })
      const cmd = createCommand('/v1/checks')
      await expect(cmd.run()).rejects.toThrow('EXIT_1')
      expect(cmd.logToStderr).toHaveBeenCalledWith(
        expect.stringContaining('checkly login'),
      )
    })

    it('shows permission hint on 403', async () => {
      vi.mocked(api.request).mockResolvedValue({
        data: { message: 'Forbidden' },
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config: {} as any,
      })
      const cmd = createCommand('/v1/checks')
      await expect(cmd.run()).rejects.toThrow('EXIT_1')
      expect(cmd.logToStderr).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied'),
      )
    })

    it('outputs error body before exiting', async () => {
      vi.mocked(api.request).mockResolvedValue({
        data: { message: 'Not found' },
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: {} as any,
      })
      const cmd = createCommand('/v1/nonexistent')
      await expect(cmd.run()).rejects.toThrow('EXIT_1')
      expect(cmd.log).toHaveBeenCalled()
    })

    it('exits cleanly on 2xx with empty body', async () => {
      vi.mocked(api.request).mockResolvedValue({
        data: '',
        status: 204,
        statusText: 'No Content',
        headers: {},
        config: {} as any,
      })
      const cmd = createCommand('/v1/checks/123', '-X', 'DELETE')
      await cmd.run()
    })
  })

  describe('--include', () => {
    it('outputs status line and headers', async () => {
      vi.mocked(api.request).mockResolvedValue({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config: {} as any,
      })
      const cmd = createCommand('/v1/checks', '-i')
      await cmd.run()
      const logs = vi.mocked(cmd.log).mock.calls.map(c => c[0])
      expect(logs[0]).toBe('HTTP/1.1 200 OK')
      expect(logs[1]).toBe('content-type: application/json')
    })
  })

  describe('--verbose', () => {
    it('writes request and response info to stderr', async () => {
      vi.mocked(api.request).mockResolvedValue({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config: {} as any,
      })
      const cmd = createCommand('/v1/checks', '--verbose')
      await cmd.run()
      const written = vi.mocked(cmd.logToStderr).mock.calls.map(c => c[0]).join('\n')
      expect(written).toContain('> GET /v1/checks')
      expect(written).toContain('< 200 OK')
    })
  })

  describe('--paginate', () => {
    it('rejects --paginate with non-GET method', async () => {
      const cmd = createCommand('/v1/checks', '-X', 'POST', '-F', 'name=Test', '--paginate')
      await expect(cmd.run()).rejects.toThrow('--paginate is only supported for GET requests')
    })

    it('concatenates paginated Content-Range results', async () => {
      vi.mocked(api.request)
        .mockResolvedValueOnce({
          data: [{ id: '1' }, { id: '2' }],
          status: 200,
          statusText: 'OK',
          headers: { 'content-range': '0-1/4' },
          config: {} as any,
        })
        .mockResolvedValueOnce({
          data: [{ id: '3' }, { id: '4' }],
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        })
      const cmd = createCommand('/v1/checks', '--paginate')
      await cmd.run()
      const loggedJson = vi.mocked(cmd.log).mock.calls[0][0]
      const parsed = JSON.parse(loggedJson)
      expect(parsed).toHaveLength(4)
    })
  })

  describe('--jq', () => {
    it('pipes output through system jq', async () => {
      vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(null, '"filtered"', '')
        return {} as any
      })
      const cmd = createCommand('/v1/checks', '--jq', '.[0].name')
      await cmd.run()
      expect(execFile).toHaveBeenCalledWith('jq', ['.[0].name'], expect.anything(), expect.anything())
      expect(cmd.log).toHaveBeenCalledWith('"filtered"')
    })

    it('shows clear error when jq is not installed', async () => {
      const enoent = new Error('spawn jq ENOENT') as NodeJS.ErrnoException
      enoent.code = 'ENOENT'
      vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(enoent, '', '')
        return {} as any
      })
      const cmd = createCommand('/v1/checks', '--jq', '.')
      await expect(cmd.run()).rejects.toThrow('--jq requires jq to be installed')
    })

    it('rejects on jq filter errors', async () => {
      const jqError = new Error('jq: error: syntax error') as NodeJS.ErrnoException
      jqError.code = 'ERR_CHILD_PROCESS'
      vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(jqError, '', 'jq: error (at <stdin>:0): syntax error')
        return {} as any
      })
      const cmd = createCommand('/v1/checks', '--jq', '.invalid[')
      await expect(cmd.run()).rejects.toThrow('jq failed:')
    })
  })

  describe('--input conflict', () => {
    it('errors when --input used with fields', async () => {
      const cmd = createCommand('/v1/checks', '-X', 'POST', '--input', 'file.json', '-f', 'name=test')
      await expect(cmd.run()).rejects.toThrow('Cannot use --input together with')
    })
  })
})
