import http from 'node:http'
import { Config } from '@oclif/core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BaseCommand } from '../baseCommand.js'
import { PACKAGE_ROOT } from '../../services/error-reporting/classify.js'
import { resetErrorReporting, setDefaultErrorReportOptions } from '../../services/error-reporting/report.js'

// Both commands live in this file, which is inside the CLI's package, so their
// TypeErrors count as bugs in the CLI's own code.

class CrashingCommand extends BaseCommand {
  run (): Promise<void> {
    const resource: any = undefined
    return resource.logicalId
  }
}

class MessageCommand extends BaseCommand {
  run (): Promise<void> {
    try {
      const resource: any = undefined
      return resource.logicalId
    } catch (err) {
      // The message, so it wraps; the error is passed for the report.
      this.style.longError('Could not read the resource.', (err as Error).message, { cause: err })
      this.exit(1)
    }
  }
}

class WarningCommand extends BaseCommand {
  run (): Promise<void> {
    try {
      const resource: any = undefined
      resource.logicalId()
    } catch (err) {
      this.style.longWarning('Could not read the resource.', err as Error)
    }
    return Promise.resolve()
  }
}

class PrintingCommand extends BaseCommand {
  run (): Promise<void> {
    try {
      const resource: any = undefined
      return resource.logicalId
    } catch (err) {
      this.style.longError('Could not read the resource.', err as Error)
      this.exit(1)
    }
  }
}

interface Envelope { level: string, exception: { values: Array<{ type: string, mechanism: { handled: boolean } }> } }

let config: Config
let server: http.Server
let dsn: string
let received: Envelope[]

beforeAll(async () => {
  config = await Config.load(PACKAGE_ROOT)
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      received.push(JSON.parse(body.split('\n')[2]))
      res.writeHead(200).end('{}')
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  dsn = `http://${'a'.repeat(72)}@127.0.0.1:${port}/123`
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
})

beforeEach(() => {
  received = []
  resetErrorReporting()
  setDefaultErrorReportOptions({ dsn, env: {} })
  // A release version: development builds never report.
  config.version = '7.1.0'
  // Keeps init from asking the npm registry for the latest version.
  vi.stubEnv('CHECKLY_E2E_CLI_VERSION', '7.1.0')
  vi.spyOn(process.stderr, 'write').mockReturnValue(true)
})

afterEach(() => {
  resetErrorReporting()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('BaseCommand error reporting', () => {
  it('reports a CLI bug that ends a command as an unhandled crash, before the command fails', async () => {
    await expect(new CrashingCommand([], config)._run()).rejects.toThrow(TypeError)

    expect(received).toHaveLength(1)
    expect(received[0].level).toBe('fatal')
    expect(received[0].exception.values[0]).toMatchObject({ type: 'TypeError', mechanism: { handled: false } })
  })

  it('reports a CLI bug a command printed with longError and exited on', async () => {
    await expect(new PrintingCommand([], config)._run()).rejects.toThrow('EEXIT: 1')

    expect(received).toHaveLength(1)
    expect(received[0].level).toBe('error')
    expect(received[0].exception.values[0]).toMatchObject({ type: 'TypeError', mechanism: { handled: true } })
  })

  it('reports a CLI bug a command printed as a message, given as the cause', async () => {
    await expect(new MessageCommand([], config)._run()).rejects.toThrow('EEXIT: 1')

    expect(received).toHaveLength(1)
    expect(received[0].exception.values[0]).toMatchObject({ type: 'TypeError', mechanism: { handled: true } })
  })

  it('reports a CLI bug a command only warned about', async () => {
    await new WarningCommand([], config)._run()

    expect(received).toHaveLength(1)
    expect(received[0].exception.values[0]).toMatchObject({ type: 'TypeError', mechanism: { handled: true } })
  })

  it('sends nothing for a development build', async () => {
    // The same crash in a release build is reported.
    await expect(new CrashingCommand([], config)._run()).rejects.toThrow(TypeError)
    expect(received).toHaveLength(1)
    resetErrorReporting()
    setDefaultErrorReportOptions({ dsn, env: {} })

    config.version = '0.0.1-dev'
    await expect(new CrashingCommand([], config)._run()).rejects.toThrow(TypeError)

    expect(received).toHaveLength(1)
  })
})
