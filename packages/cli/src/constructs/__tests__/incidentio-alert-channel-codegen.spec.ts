import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { IncidentioAlertChannelCodegen, type IncidentioAlertChannelResource } from '../incidentio-alert-channel-codegen.js'
import { Context, ImportSafetyViolation, MASKED_VALUE } from '../internal/codegen/index.js'
import { Program } from '../../sourcegen/index.js'

/**
 * The incident.io codegen derives `apiKey` from the stored authorization
 * header. The deploy preview masks that header (and the URL and the webhook
 * secret) before rendering, so a masked value must print in the key's place
 * and never be parsed or refused; under an import nothing is masked and the
 * rules hold as before.
 */
describe('IncidentioAlertChannelCodegen', () => {
  let rootDirectory: string

  beforeEach(async () => {
    rootDirectory = await mkdtemp(path.join(tmpdir(), 'incidentio-alert-channel-codegen-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true })
  })

  const resource = (config: Partial<IncidentioAlertChannelResource['config']> = {}): IncidentioAlertChannelResource => ({
    id: 123,
    type: 'WEBHOOK',
    config: {
      name: 'Incidents',
      webhookType: 'WEBHOOK_INCIDENTIO',
      url: 'https://api.incident.io/v2/alert_events/http/abc',
      method: 'POST',
      headers: [{ key: 'authorization', value: 'Bearer real-key', locked: false }],
      queryParameters: [],
      webhookSecret: null,
      ...config,
    },
    sendRecovery: true,
    sendFailure: true,
    sendDegraded: false,
    sslExpiry: false,
    sslExpiryThreshold: 30,
  })

  async function render (context: Context, channel: IncidentioAlertChannelResource): Promise<string> {
    const program = new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    })
    const codegen = new IncidentioAlertChannelCodegen(program)
    codegen.prepare('incidents', channel, context)
    codegen.gencode('incidents', channel, context)
    await program.realize()
    const [filePath] = program.paths
    if (filePath === undefined) {
      throw new Error('Codegen did not register a generated file')
    }
    return readFile(filePath, 'utf8')
  }

  it('extracts the API key from the bearer header on import', async () => {
    const source = await render(new Context(), resource())
    expect(source).toContain('apiKey: \'real-key\'')
  })

  it('refuses a webhook secret on import', () => {
    const codegen = new IncidentioAlertChannelCodegen(new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    }))
    expect(() => codegen.prepare('incidents', resource({ webhookSecret: 'set' }), new Context()))
      .toThrow(ImportSafetyViolation)
  })

  it('prints a masked header as the API key and accepts a masked webhook secret in a preview', async () => {
    const changed = `${MASKED_VALUE} (changed#nonce-0)`
    const context = new Context({ maskedValues: new Set([MASKED_VALUE, changed]) })
    const source = await render(context, resource({
      url: MASKED_VALUE,
      headers: [{ key: 'authorization', value: changed, locked: false }],
      webhookSecret: MASKED_VALUE,
    }))
    expect(source).toContain(`apiKey: '${changed}'`)
    expect(source).toContain(`url: '${MASKED_VALUE}'`)
  })

  it('does not treat the mask as a key outside a preview', () => {
    const codegen = new IncidentioAlertChannelCodegen(new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    }))
    const context = new Context()
    const channel = resource({ headers: [{ key: 'authorization', value: MASKED_VALUE, locked: false }] })
    codegen.prepare('incidents', channel, context)
    expect(() => codegen.gencode('incidents', channel, context)).toThrow(/API Key/)
  })
})
