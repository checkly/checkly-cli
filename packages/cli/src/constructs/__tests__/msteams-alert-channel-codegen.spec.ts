import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MSTeamsAlertChannelCodegen, type MSTeamsAlertChannelResource } from '../msteams-alert-channel-codegen.js'
import { Context, MASKED_VALUE } from '../internal/codegen/index.js'
import { Program } from '../../sourcegen/index.js'

describe('MSTeamsAlertChannelCodegen', () => {
  let rootDirectory: string

  beforeEach(async () => {
    rootDirectory = await mkdtemp(path.join(tmpdir(), 'msteams-alert-channel-codegen-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true })
  })

  it('imports as MSTeamsAlertChannel when webhookSecret is null', async () => {
    const program = new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    })
    const codegen = new MSTeamsAlertChannelCodegen(program)
    const context = new Context()
    const resource: MSTeamsAlertChannelResource = {
      id: 123,
      type: 'WEBHOOK',
      config: {
        name: 'Teams channel',
        webhookType: 'WEBHOOK_MSTEAMS',
        url: 'https://example.webhook.office.com/webhookb2/abc',
        method: 'POST',
        headers: [],
        webhookSecret: null,
      },
      sendRecovery: true,
      sendFailure: true,
      sendDegraded: false,
      sslExpiry: false,
      sslExpiryThreshold: 30,
    }

    codegen.prepare('teams-channel', resource, context)
    codegen.gencode('teams-channel', resource, context)
    await program.realize()

    const [filePath] = program.paths
    if (filePath === undefined) {
      throw new Error('Codegen did not register a generated file')
    }
    const source = await readFile(filePath, 'utf8')

    expect(source).toContain('MSTeamsAlertChannel')
  })

  // The deploy preview masks the webhook secret even when it is null, so a
  // masked value must not be refused as a secret the construct cannot carry.
  it('accepts a masked webhook secret in a preview', async () => {
    const program = new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    })
    const codegen = new MSTeamsAlertChannelCodegen(program)
    const context = new Context({ maskedValues: new Set([MASKED_VALUE]) })
    const resource: MSTeamsAlertChannelResource = {
      id: 123,
      type: 'WEBHOOK',
      config: {
        name: 'Teams channel',
        webhookType: 'WEBHOOK_MSTEAMS',
        url: MASKED_VALUE,
        method: 'POST',
        headers: [],
        webhookSecret: MASKED_VALUE,
      },
      sendRecovery: true,
      sendFailure: true,
      sendDegraded: false,
      sslExpiry: false,
      sslExpiryThreshold: 30,
    }

    codegen.prepare('teams-channel', resource, context)
    codegen.gencode('teams-channel', resource, context)
    await program.realize()

    const [filePath] = program.paths
    if (filePath === undefined) {
      throw new Error('Codegen did not register a generated file')
    }
    const source = await readFile(filePath, 'utf8')

    expect(source).toContain(`url: '${MASKED_VALUE}'`)
  })
})
