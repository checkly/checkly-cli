import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { DnsMonitorCodegen, DnsMonitorResource } from '../dns-monitor-codegen'
import { Context } from '../internal/codegen/context'
import { Program } from '../../sourcegen'

interface RenderEnv {
  rootDirectory: string
  cleanup: () => Promise<void>
}

async function createRenderEnv (): Promise<RenderEnv> {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'dns-codegen-'))
  return {
    rootDirectory,
    cleanup: () => rm(rootDirectory, { recursive: true, force: true }),
  }
}

async function renderResource (env: RenderEnv, resource: DnsMonitorResource): Promise<string> {
  const program = new Program({
    rootDirectory: env.rootDirectory,
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })

  const codegen = new DnsMonitorCodegen(program)
  const context = new Context()

  codegen.gencode(resource.id, resource, context)

  await program.realize()

  const [filePath] = program.paths
  if (filePath === undefined) {
    throw new Error('DnsMonitorCodegen did not register any generated files')
  }

  return readFile(filePath, 'utf8')
}

const baseResource = (request: DnsMonitorResource['request']): DnsMonitorResource => ({
  id: 'dns-monitor',
  checkType: 'DNS',
  name: 'DNS Monitor',
  request,
})

describe('DnsMonitorCodegen', () => {
  let env: RenderEnv

  beforeEach(async () => {
    env = await createRenderEnv()
  })

  afterEach(async () => {
    await env.cleanup()
  })

  it('should roundtrip a new record type and dnsConfig', async () => {
    const source = await renderResource(env, baseResource({
      recordType: 'SRV',
      query: '_sip._tcp.example.com',
      dnsConfig: {
        queryTimeoutSeconds: 3,
        followCname: true,
      },
    }))

    expect(source).toContain('new DnsMonitor(\'dns-monitor\'')
    expect(source).toContain('recordType: \'SRV\'')
    expect(source).toContain('dnsConfig: {')
    expect(source).toContain('queryTimeoutSeconds: 3')
    expect(source).toContain('followCname: true')
  })

  it('should roundtrip dnsConfig.changeDetection', async () => {
    const source = await renderResource(env, baseResource({
      recordType: 'A',
      query: 'acme.com',
      dnsConfig: {
        changeDetection: {
          enabled: true,
          includeTtl: true,
        },
      },
    }))

    expect(source).toContain('dnsConfig: {')
    expect(source).toContain('changeDetection: {')
    expect(source).toContain('enabled: true')
    expect(source).toContain('includeTtl: true')
  })

  it('should omit includeTtl from changeDetection when absent', async () => {
    const source = await renderResource(env, baseResource({
      recordType: 'A',
      query: 'acme.com',
      dnsConfig: {
        changeDetection: {
          enabled: false,
        },
      },
    }))

    expect(source).toContain('changeDetection: {')
    expect(source).toContain('enabled: false')
    expect(source).not.toContain('includeTtl')
  })

  it('should omit changeDetection when absent', async () => {
    const source = await renderResource(env, baseResource({
      recordType: 'A',
      query: 'acme.com',
      dnsConfig: {
        followCname: true,
      },
    }))

    expect(source).not.toContain('changeDetection')
  })

  it('should roundtrip ANSWER assertions with quantifiers and matches', async () => {
    const source = await renderResource(env, baseResource({
      recordType: 'A',
      query: 'acme.com',
      assertions: [
        { source: 'ANSWER', property: 'data', quantifier: 'EVERY', comparison: 'EQUALS', target: '192.0.2.1', regex: null },
        { source: 'ANSWER', property: 'data', quantifier: 'SOME', comparison: 'MATCHES', target: '^10\\.', regex: null },
        { source: 'ANSWER', property: 'ttl', quantifier: 'EVERY', comparison: 'GREATER_THAN', target: '300', regex: null },
        { source: 'ANSWER', property: 'count', comparison: 'GREATER_THAN', target: '0', regex: null },
      ],
    }))

    expect(source).toContain('DnsAssertionBuilder.answerData(\'EVERY\').equals(\'192.0.2.1\')')
    expect(source).toContain('DnsAssertionBuilder.answerData(\'SOME\').matches(\'^10\\\\.\')')
    expect(source).toContain('DnsAssertionBuilder.answerTtl(\'EVERY\').greaterThan(300)')
    expect(source).toContain('DnsAssertionBuilder.answerCount().greaterThan(0)')
  })

  it('should roundtrip matches / notMatches on the shared general builder', async () => {
    const source = await renderResource(env, baseResource({
      recordType: 'TXT',
      query: 'acme.com',
      assertions: [
        { source: 'TEXT_ANSWER', property: '', comparison: 'MATCHES', target: 'v=spf1.*', regex: null },
        { source: 'JSON_ANSWER', property: '$.Answer[0].data', comparison: 'NOT_MATCHES', target: 'bad', regex: null },
      ],
    }))

    expect(source).toContain('DnsAssertionBuilder.textAnswer().matches(\'v=spf1.*\')')
    expect(source).toContain('DnsAssertionBuilder.jsonAnswer(\'$.Answer[0].data\').notMatches(\'bad\')')
  })

  it('should omit dnsConfig when absent (v1-shaped request)', async () => {
    const source = await renderResource(env, baseResource({
      recordType: 'A',
      query: 'acme.com',
    }))

    expect(source).not.toContain('dnsConfig')
  })
})
