import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiCheckCodegen, ApiCheckResource } from '../api-check-codegen.js'
import { BrowserCheckCodegen, BrowserCheckResource } from '../browser-check-codegen.js'
import { MultiStepCheckCodegen, MultiStepCheckResource } from '../multi-step-check-codegen.js'
import { Codegen, Context } from '../internal/codegen/index.js'
import { Program } from '../../sourcegen/index.js'

async function renderResource<T extends { id: string }> (
  rootDirectory: string,
  makeCodegen: (program: Program) => Codegen<T>,
  resource: T,
): Promise<string> {
  const program = new Program({
    rootDirectory,
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })

  makeCodegen(program).gencode(resource.id, resource, new Context())
  await program.realize()

  const filePath = program.paths.find(filePath => filePath.endsWith('.check.ts'))
  if (filePath === undefined) {
    throw new Error('Codegen did not register a construct file')
  }

  return readFile(filePath, 'utf8')
}

describe('automatic check repair codegen', () => {
  let rootDirectory: string

  beforeEach(async () => {
    rootDirectory = await mkdtemp(path.join(tmpdir(), 'automatic-check-repair-codegen-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true })
  })

  it.each([true, false, null])('emits BrowserCheck ownership %j', async aiAutoRepairEnabled => {
    const resource: BrowserCheckResource = {
      id: `browser-${String(aiAutoRepairEnabled)}`,
      checkType: 'BROWSER',
      name: 'Browser check',
      script: 'console.log("browser")',
      aiAutoRepairEnabled,
    }

    const source = await renderResource(rootDirectory, program => new BrowserCheckCodegen(program), resource)
    expect(source).toContain(`aiAutoRepairEnabled: ${String(aiAutoRepairEnabled)}`)
  })

  it.each([true, false, null])('emits MultiStepCheck ownership %j', async aiAutoRepairEnabled => {
    const resource: MultiStepCheckResource = {
      id: `multi-step-${String(aiAutoRepairEnabled)}`,
      checkType: 'MULTI_STEP',
      name: 'MultiStep check',
      script: 'console.log("multi-step")',
      aiAutoRepairEnabled,
    }

    const source = await renderResource(rootDirectory, program => new MultiStepCheckCodegen(program), resource)
    expect(source).toContain(`aiAutoRepairEnabled: ${String(aiAutoRepairEnabled)}`)
  })

  it('does not emit automatic repair for API checks before support lands', async () => {
    const resource: ApiCheckResource = {
      id: 'api-check',
      checkType: 'API',
      name: 'API check',
      aiAutoRepairEnabled: true,
      request: {
        method: 'GET',
        url: 'https://example.com',
      },
    }

    const source = await renderResource(rootDirectory, program => new ApiCheckCodegen(program), resource)
    expect(source).not.toContain('aiAutoRepairEnabled:')
  })
})
