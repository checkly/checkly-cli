import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  buildErrorEvent,
  findCliBug,
  isCliBug,
  isErrorReportingDisabled,
  noteCliError,
  releaseEnvironment,
  reportCliError,
  reportNotedCliError,
  resetErrorReporting,
  scrubMessage,
} from '../error-reporting.js'

const KEY = 'a'.repeat(72)

let installDir: string
let cliBug: Error
let dependencyBug: Error
let invalidUrl: Error
let privatePackageBug: Error

async function errorThrownIn (file: string, code: string): Promise<Error> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `export function run () { ${code} }\n`)
  const { run } = await import(pathToFileURL(file).href)
  try {
    run()
  } catch (err) {
    return err as Error
  }
  throw new Error(`${file} did not throw`)
}

interface Received { url: string, body: string }

async function withIngest (fn: (dsn: string, received: Received[]) => Promise<void>): Promise<void> {
  const received: Received[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      received.push({ url: req.url ?? '', body })
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}')
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  try {
    await fn(`http://${KEY}@127.0.0.1:${port}/123`, received)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

beforeAll(async () => {
  // The space makes ES module stack frames carry %20 in their file URLs.
  installDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'checkly error reporting-')))
  await fs.writeFile(path.join(installDir, 'package.json'), JSON.stringify({ dependencies: { 'some-dep': '1.0.0' } }))
  cliBug = await errorThrownIn(
    path.join(installDir, 'dist', 'commands', 'deploy.mjs'),
    'const resource = undefined; return resource.logicalId',
  )
  dependencyBug = await errorThrownIn(
    path.join(installDir, 'node_modules', 'some-dep', 'index.mjs'),
    'null.x',
  )
  privatePackageBug = await errorThrownIn(
    path.join(installDir, 'node_modules', '@acme-internal', 'billing', 'index.mjs'),
    'null.x',
  )
  invalidUrl = await errorThrownIn(
    path.join(installDir, 'dist', 'services', 'proxy.mjs'),
    'new URL(\'not a url\')',
  )
})

afterAll(async () => {
  await fs.rm(installDir, { recursive: true, force: true })
})

beforeEach(() => {
  resetErrorReporting()
})

describe('isCliBug', () => {
  it('accepts a runtime error raised in the CLI\'s own files', () => {
    expect(cliBug).toBeInstanceOf(TypeError)
    expect(isCliBug(cliBug, installDir)).toBe(true)
  })

  it('accepts it when the stack names the file by URL, as the installed CLI\'s ES modules do', () => {
    // Vitest loads modules itself and its stacks show plain paths, so the URL form is built here:
    // file:///C:/... on Windows, with the space in the install path as %20.
    const url = pathToFileURL(path.join(installDir, 'dist', 'commands', 'deploy.js')).href
    expect(url).toContain('%20')
    const err = new TypeError('Cannot read properties of undefined (reading \'logicalId\')')
    err.stack = `TypeError: ${err.message}\n    at Deploy.run (${url}:12:34)\n    at async Deploy._run (${url}:1:1)`
    expect(isCliBug(err, installDir)).toBe(true)
  })

  it('rejects the same error when it was raised outside the CLI, e.g. in a user\'s check file', async () => {
    const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-other-'))
    try {
      expect(isCliBug(cliBug, elsewhere)).toBe(false)
    } finally {
      await fs.rm(elsewhere, { recursive: true, force: true })
    }
  })

  it('rejects errors raised in a dependency of the CLI', () => {
    expect(dependencyBug).toBeInstanceOf(TypeError)
    expect(isCliBug(dependencyBug, installDir)).toBe(false)
  })

  it('rejects the TypeError Node raises for a malformed URL the user gave', () => {
    expect(invalidUrl).toBeInstanceOf(TypeError)
    expect((invalidUrl as NodeJS.ErrnoException).code).toBe('ERR_INVALID_URL')
    // The same place counts as a CLI bug for any other TypeError, so only the code rejects it.
    const other = new TypeError('x')
    other.stack = invalidUrl.stack!.replace(/^TypeError.*$/m, 'TypeError: x')
    expect(isCliBug(other, installDir)).toBe(true)
    expect(isCliBug(invalidUrl, installDir)).toBe(false)
  })

  it('rejects errors the CLI throws on purpose', () => {
    const intentional = new Error('Your Checkly configuration file is not valid.')
    intentional.stack = cliBug.stack!.replace(/^TypeError: .*$/m, 'Error: Your Checkly configuration file is not valid.')
    expect(isCliBug(intentional, installDir)).toBe(false)
    expect(isCliBug('a string', installDir)).toBe(false)
  })
})

describe('findCliBug', () => {
  it('finds the CLI bug a wrapper hides in its cause, as loading a check file does', () => {
    const wrapper = new Error(`Error loading file '${installDir}/__checks__/api.check.ts'\n${cliBug.stack}`, {
      cause: cliBug,
    })
    expect(isCliBug(wrapper, installDir)).toBe(false)
    expect(findCliBug(wrapper, installDir)).toBe(cliBug)
    expect(findCliBug(new Error('wrapper', { cause: dependencyBug }), installDir)).toBeUndefined()
  })
})

describe('scrubMessage', () => {
  it('removes credentials and paths that name the user', () => {
    const env = { CHECKLY_API_KEY: 'my-secret-api-key-value' }
    const message = [
      'key cu_0123456789abcdef0123456789abcdef',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc',
      'https://user:pass@proxy.example.com:8080',
      'token=abc123',
      'https://x/cb?access_token=SECRET1 client_secret=SECRET2 accessToken: SECRET3',
      'env my-secret-api-key-value',
      `home ${os.homedir()}/file`,
      `cwd ${process.cwd()}/checkly.config.ts`,
    ].join('\n')

    const scrubbed = scrubMessage(message, env)

    expect(scrubbed).not.toContain('cu_0123')
    expect(scrubbed).not.toContain('eyJhbGci')
    expect(scrubbed).not.toContain('user:pass')
    expect(scrubbed).not.toContain('abc123')
    expect(scrubbed).not.toMatch(/SECRET[123]/)
    expect(scrubbed).not.toContain('my-secret-api-key-value')
    expect(scrubbed).not.toContain(os.homedir())
    expect(scrubbed).toMatch(/cwd <project file>$/)
  })

  it('removes whole paths only, so a short working directory leaves other text alone', () => {
    const scrubbed = scrubMessage('Cannot read \'/app/__checks__/acme.check.ts\' as /application/json from /app', {}, {
      cwd: '/app',
      home: '/root',
      platform: 'linux',
    })
    expect(scrubbed).toBe('Cannot read \'<project file>\' as /application/json from <project file>')
  })

  it('removes Windows paths in any case, with forward slashes, and as file URLs', () => {
    const options = { cwd: 'C:\\Users\\Ann Lee\\proj', home: 'C:\\Users\\Ann Lee', platform: 'win32' as const }
    const message = [
      'c:/users/ann lee/proj/checkly.config.ts',
      'file:///C:/Users/Ann%20Lee/proj/a.check.ts',
      'C:\\Users\\Ann Lee\\other\\x.ts',
    ].join('\n')

    const scrubbed = scrubMessage(message, {}, options)

    expect(scrubbed).toBe('<project file>\n<project file>\n<home file>')
  })
})

describe('buildErrorEvent', () => {
  it('names the CLI\'s files relative to the package and nothing about the machine', async () => {
    const event = await buildErrorEvent(cliBug, { version: '7.1.0', command: 'deploy', cliMode: 'ci' }, {
      packageRoot: installDir,
    })

    const [exception] = event.exception!.values!
    expect(exception.type).toBe('TypeError')
    const ownFrame = exception.stacktrace!.frames!.at(-1)!
    expect(ownFrame).toMatchObject({ filename: 'checkly/dist/commands/deploy.mjs', function: 'run', in_app: true })
    expect(event).toMatchObject({
      release: 'checkly@7.1.0',
      environment: 'production',
      tags: { command: 'deploy', cli_mode: 'ci' },
    })

    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain(installDir)
    expect(serialized).not.toContain(os.homedir())
    expect(serialized).not.toContain(os.hostname())
    expect(event).not.toHaveProperty('server_name')
    expect(event).not.toHaveProperty('user')
  })

  it('does not count a dependency under the CLI\'s own node_modules as CLI code', async () => {
    const event = await buildErrorEvent(dependencyBug, { version: '7.1.0' }, { packageRoot: installDir })

    const frame = event.exception!.values![0].stacktrace!.frames!.at(-1)!
    expect(frame).toMatchObject({ filename: 'node_modules/some-dep/index.mjs', in_app: false })
  })

  it('does not name a package the CLI does not depend on, which may be a private one of the user\'s', async () => {
    const event = await buildErrorEvent(privatePackageBug, { version: '7.1.0' }, { packageRoot: installDir })

    const frame = event.exception!.values![0].stacktrace!.frames!.at(-1)!
    expect(frame).toEqual({ filename: '<dependency>', function: '<redacted>', in_app: false })
    expect(JSON.stringify(event)).not.toContain('acme-internal')
  })
})

describe('releaseEnvironment', () => {
  it('tells releases apart by version', () => {
    expect(releaseEnvironment('7.1.0')).toBe('production')
    expect(releaseEnvironment('7.1.0-rc.2')).toBe('rc')
    expect(releaseEnvironment('7.1.0-prerelease-abc1234')).toBe('prerelease')
  })
})

describe('isErrorReportingDisabled', () => {
  it('honours CHECKLY_NO_ERROR_REPORTING and DO_NOT_TRACK, and not an explicit off', () => {
    expect(isErrorReportingDisabled({})).toBe(false)
    expect(isErrorReportingDisabled({ CHECKLY_NO_ERROR_REPORTING: '1' })).toBe(true)
    expect(isErrorReportingDisabled({ DO_NOT_TRACK: '1' })).toBe(true)
    expect(isErrorReportingDisabled({ DO_NOT_TRACK: '0' })).toBe(false)
  })
})

describe('reportCliError', () => {
  it('sends one envelope with the error to the DSN\'s project', async () => {
    await withIngest(async (dsn, received) => {
      await reportCliError(cliBug, { version: '7.1.0', command: 'deploy' }, { dsn, packageRoot: installDir, env: {} })
      // Once per run: a second error in the same run is not sent.
      await reportCliError(cliBug, { version: '7.1.0', command: 'deploy' }, { dsn, packageRoot: installDir, env: {} })

      expect(received).toHaveLength(1)
      expect(received[0].url).toMatch(/^\/api\/123\/envelope\/\?.*sentry_key=a{72}/)
      const [header, itemHeader, item] = received[0].body.split('\n').map(line => JSON.parse(line))
      expect(header.sdk).toMatchObject({ name: 'checkly-cli', version: '7.1.0' })
      expect(itemHeader.type).toBe('event')
      expect(item.event_id).toBe(header.event_id)
      expect(item.exception.values[0]).toMatchObject({ type: 'TypeError' })
    })
  })

  it.each([
    ['the user turned reporting off', { version: '7.1.0' }, { DO_NOT_TRACK: '1' }],
    ['the build is a development build', { version: '0.0.1-dev' }, {}],
  ])('sends nothing when %s', async (_, context, env) => {
    await withIngest(async (dsn, received) => {
      await reportCliError(cliBug, context, { dsn, packageRoot: installDir, env })
      expect(received).toHaveLength(0)

      // The same call reports once the reason is gone, so the empty result above is not a broken server.
      await reportCliError(cliBug, { version: '7.1.0' }, { dsn, packageRoot: installDir, env: {} })
      expect(received).toHaveLength(1)
    })
  })

  it('reports only the wrapped CLI bug, not the wrapper that quotes a user\'s file', async () => {
    await withIngest(async (dsn, received) => {
      const wrapper = new Error(`Error loading file '${installDir}/__checks__/api.check.ts'`, { cause: cliBug })
      await reportCliError(wrapper, { version: '7.1.0' }, { dsn, packageRoot: installDir, env: {} })

      expect(received).toHaveLength(1)
      expect(received[0].body).not.toContain('Error loading file')
      const item = JSON.parse(received[0].body.split('\n')[2])
      expect(item.exception.values.map((value: { type: string }) => value.type)).toEqual(['TypeError'])
    })
  })

  it('sends the first error noted during the run when asked, as commands that print their errors need', async () => {
    await withIngest(async (dsn, received) => {
      noteCliError(new Error('Your project could not be deployed.'), { packageRoot: installDir })
      noteCliError(cliBug, { packageRoot: installDir })
      noteCliError(invalidUrl, { packageRoot: installDir, handled: false })
      expect(received).toHaveLength(0)

      await reportNotedCliError(() => ({ version: '7.1.0', command: 'deploy' }), {
        dsn,
        packageRoot: installDir,
        env: {},
      })

      expect(received).toHaveLength(1)
      const item = JSON.parse(received[0].body.split('\n')[2])
      expect(item.exception.values[0].value).toBe(cliBug.message)
      // The command printed it and exited, so it is not an unhandled crash.
      expect(item.level).toBe('error')
      expect(item.exception.values[0].mechanism).toEqual({ type: 'generic', handled: true })
    })
  })

  it('reports an error that ended the command as an unhandled crash, and builds no context without one', async () => {
    await withIngest(async (dsn, received) => {
      let contextBuilt = false
      const context = () => {
        contextBuilt = true
        return { version: '7.1.0' }
      }
      await reportNotedCliError(context, { dsn, packageRoot: installDir, env: {} })
      expect(contextBuilt).toBe(false)

      noteCliError(cliBug, { packageRoot: installDir, handled: false })
      await reportNotedCliError(context, { dsn, packageRoot: installDir, env: {} })

      expect(contextBuilt).toBe(true)
      expect(received).toHaveLength(1)
      const item = JSON.parse(received[0].body.split('\n')[2])
      expect(item.level).toBe('fatal')
      expect(item.exception.values[0].mechanism.handled).toBe(false)
    })
  })

  it('reads the DSN from the file the release writes, and sends nothing without it', async () => {
    await withIngest(async (dsn, received) => {
      const missing = path.join(installDir, 'missing', 'error-reporting.json')
      await reportCliError(cliBug, { version: '7.1.0' }, { dsnFile: missing, packageRoot: installDir, env: {} })
      expect(received).toHaveLength(0)

      const dsnFile = path.join(installDir, 'error-reporting.json')
      await fs.writeFile(dsnFile, JSON.stringify({ dsn }))
      await reportCliError(cliBug, { version: '7.1.0' }, { dsnFile, packageRoot: installDir, env: {} })
      expect(received).toHaveLength(1)
    })
  })

  it('never throws when the ingest is unreachable', async () => {
    await expect(reportCliError(cliBug, { version: '7.1.0' }, {
      dsn: `http://${KEY}@127.0.0.1:1/123`,
      packageRoot: installDir,
      env: {},
    })).resolves.toBeUndefined()
  })
})
