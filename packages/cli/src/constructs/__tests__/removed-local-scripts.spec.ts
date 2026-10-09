import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiCheck } from '../api-check.js'
import { ApiCheckCodegen, ApiCheckResource } from '../api-check-codegen.js'
import { RemovedPropertyDiagnostic } from '../construct-diagnostics.js'
import { Diagnostics } from '../diagnostics.js'
import { Context } from '../internal/codegen/index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { Program } from '../../sourcegen/index.js'
import { Bundler } from '../../services/check-parser/bundler.js'
import { loadSnapshot } from '../../runtimes/index.js'

// `localSetupScript` and `localTearDownScript` are not part of
// ApiCheckProps; `create` spreads `extra` into the props the way plain
// JavaScript would.
function create (extra: object): ApiCheck {
  return new ApiCheck('api', {
    name: 'API', request: { url: 'https://example.com', method: 'GET' }, ...extra,
  })
}

async function removedDiagnostics (construct: ApiCheck): Promise<RemovedPropertyDiagnostic[]> {
  const diagnostics = new Diagnostics()
  await construct.validate(diagnostics)
  return diagnostics.observations.filter((observation): observation is RemovedPropertyDiagnostic =>
    observation instanceof RemovedPropertyDiagnostic)
}

async function bundlePayload (construct: ApiCheck): Promise<Record<string, unknown>> {
  const bundler = await Bundler.create({ cacheHash: 'removed-local-scripts' })
  const bundle = await construct.bundle(bundler)
  return bundle.synthesize() as Record<string, unknown>
}

describe('removed ApiCheck localSetupScript and localTearDownScript', () => {
  beforeEach(async () => {
    Session.project = new Project('removed-local-scripts', { name: 'Removed local scripts' })
    Session.availableRuntimes = await loadSnapshot()
    Session.defaultRuntimeId = '2025.04'
  })

  afterEach(() => {
    Session.reset()
  })

  describe('ApiCheck', () => {
    it.each([
      ['localSetupScript', 'setupScript'],
      ['localTearDownScript', 'tearDownScript'],
    ])('reports %s as removed', async (property, replacement) => {
      const construct = create({ [property]: 'console.log("script")' })
      const [diagnostic, ...rest] = await removedDiagnostics(construct)
      expect(rest).toEqual([])
      expect(diagnostic?.property).toBe(property)
      expect(diagnostic?.isFatal()).toBe(true)
      expect(diagnostic?.message).toContain(`${replacement}: { content: '...' }`)
    })

    it.each(['', null])('reports %j too', async value => {
      const diagnostics = await removedDiagnostics(create({ localSetupScript: value }))
      expect(diagnostics.map(diagnostic => diagnostic.property)).toEqual(['localSetupScript'])
    })

    it('reports nothing when the properties are not set', async () => {
      expect(await removedDiagnostics(create({}))).toEqual([])
    })

    it('does not send the removed properties', async () => {
      const payload = await bundlePayload(create({
        localSetupScript: 'console.log("setup")',
        localTearDownScript: 'console.log("teardown")',
      }))
      expect(payload.localSetupScript).toBeUndefined()
      expect(payload.localTearDownScript).toBeUndefined()
    })
  })

  it('sends an ApiCheck setupScript and tearDownScript as localSetupScript and localTearDownScript', async () => {
    const check = new ApiCheck('api', {
      name: 'API',
      request: { url: 'https://example.com', method: 'GET' },
      setupScript: { content: 'console.log("setup")' },
      tearDownScript: { content: 'console.log("teardown")' },
    })
    expect(await removedDiagnostics(check)).toEqual([])
    const payload = await bundlePayload(check)
    expect(payload.localSetupScript).toBe('console.log("setup")')
    expect(payload.localTearDownScript).toBe('console.log("teardown")')
  })
})

describe('ApiCheck codegen of setup and teardown scripts', () => {
  let rootDirectory: string

  beforeEach(async () => {
    rootDirectory = await mkdtemp(path.join(tmpdir(), 'removed-local-scripts-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true })
  })

  function program (): Program {
    return new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    })
  }

  it('generates setupScript and tearDownScript for an ApiCheck', async () => {
    const prog = program()
    const resource: ApiCheckResource = {
      id: 'api-1',
      checkType: 'API',
      name: 'API',
      request: { url: 'https://example.com', method: 'GET' },
      localSetupScript: 'console.log("setup")\n',
      localTearDownScript: 'console.log("teardown")\n',
    }
    new ApiCheckCodegen(prog).gencode('api', resource, new Context())
    await prog.realize()
    const constructFile = prog.paths.find(filePath => filePath.endsWith('.check.ts'))
    expect(constructFile).toBeDefined()
    const source = await readFile(constructFile!, 'utf8')
    expect(source).toContain('setupScript: {')
    expect(source).toContain('tearDownScript: {')
    expect(source).not.toContain('localSetupScript')
    expect(source).not.toContain('localTearDownScript')
  })
})
