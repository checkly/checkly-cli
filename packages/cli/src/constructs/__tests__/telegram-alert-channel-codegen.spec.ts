import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TelegramAlertChannelCodegen, type TelegramAlertChannelResource } from '../telegram-alert-channel-codegen.js'
import { Context } from '../internal/codegen/index.js'
import { Program } from '../../sourcegen/index.js'

describe('TelegramAlertChannelCodegen', () => {
  let rootDirectory: string

  beforeEach(async () => {
    rootDirectory = await mkdtemp(path.join(tmpdir(), 'telegram-alert-channel-codegen-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true })
  })

  it('preserves the message thread ID when exporting a Telegram alert channel', async () => {
    const program = new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    })
    const codegen = new TelegramAlertChannelCodegen(program)
    const context = new Context()
    const resource: TelegramAlertChannelResource = {
      id: 123,
      type: 'WEBHOOK',
      config: {
        name: 'Telegram topic',
        webhookType: 'WEBHOOK_TELEGRAM',
        url: 'https://api.telegram.org/bot123456:ABC/sendMessage',
        method: 'POST',
        headers: [],
        template: 'chat_id=-701234567&message_thread_id=42&parse_mode=HTML&text=test',
      },
      sendRecovery: true,
      sendFailure: true,
      sendDegraded: false,
      sslExpiry: false,
      sslExpiryThreshold: 30,
    }

    codegen.prepare('telegram-topic', resource, context)
    codegen.gencode('telegram-topic', resource, context)
    await program.realize()

    const [filePath] = program.paths
    if (filePath === undefined) {
      throw new Error('Codegen did not register a generated file')
    }
    const source = await readFile(filePath, 'utf8')

    expect(source).toContain(`messageThreadId: '42'`)
  })
})
