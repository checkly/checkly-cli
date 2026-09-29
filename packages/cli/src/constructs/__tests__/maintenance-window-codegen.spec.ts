import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MaintenanceWindowCodegen, type MaintenanceWindowResource } from '../maintenance-window-codegen.js'
import { Context } from '../internal/codegen/index.js'
import { Program } from '../../sourcegen/index.js'

describe('MaintenanceWindowCodegen', () => {
  let rootDirectory: string

  beforeEach(async () => {
    rootDirectory = await mkdtemp(path.join(tmpdir(), 'maintenance-window-codegen-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true })
  })

  async function generate (resource: MaintenanceWindowResource): Promise<string> {
    const program = new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    })
    const codegen = new MaintenanceWindowCodegen(program)
    const context = new Context()

    codegen.prepare('maintenance-window', resource, context)
    codegen.gencode('maintenance-window', resource, context)
    await program.realize()

    const [filePath] = program.paths
    if (filePath === undefined) {
      throw new Error('Codegen did not register a generated file')
    }
    return readFile(filePath, 'utf8')
  }

  const baseResource: MaintenanceWindowResource = {
    name: 'Weekly database maintenance',
    tags: ['database'],
    startsAt: '2030-01-01T09:00:00.000Z',
    endsAt: '2030-01-01T10:00:00.000Z',
  }

  it('emits the timezone and the pause and silence scope', async () => {
    const source = await generate({
      ...baseResource,
      timezone: 'Europe/Berlin',
      pauseAllChecks: true,
      silenceAlertsTags: ['api'],
      silenceAllAlerts: true,
    })

    expect(source).toContain(`timezone: 'Europe/Berlin'`)
    expect(source).toContain(`pauseAllChecks: true`)
    expect(source).toContain(`silenceAlertsTags: [`)
    expect(source).toContain(`silenceAllAlerts: true`)
  })

  it('omits unset and default values', async () => {
    const source = await generate({
      ...baseResource,
      timezone: null,
      pauseAllChecks: false,
      silenceAlertsTags: [],
      silenceAllAlerts: false,
    })

    expect(source).not.toContain('timezone')
    expect(source).not.toContain('pauseAllChecks')
    expect(source).not.toContain('silenceAlertsTags')
    expect(source).not.toContain('silenceAllAlerts')
  })
})
