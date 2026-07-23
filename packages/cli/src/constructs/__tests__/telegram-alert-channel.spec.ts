import { beforeEach, describe, expect, it } from 'vitest'

import { Project } from '../project.js'
import { Session } from '../session.js'
import { TelegramAlertChannel } from '../telegram-alert-channel.js'

describe('TelegramAlertChannel', () => {
  beforeEach(() => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
  })

  it('includes the message thread ID in the Telegram request template', () => {
    const channel = new TelegramAlertChannel('telegram-topic', {
      name: 'Telegram topic',
      apiKey: '123456:ABC',
      chatId: '-701234567',
      messageThreadId: '42',
      payload: 'test',
    })

    expect(channel.synthesize()).toMatchObject({
      type: 'WEBHOOK',
      config: {
        webhookType: 'WEBHOOK_TELEGRAM',
        template: 'chat_id=-701234567&message_thread_id=42&parse_mode=HTML&text=test',
      },
    })
  })

  it('keeps the existing template shape when no message thread ID is configured', () => {
    const channel = new TelegramAlertChannel('telegram-chat', {
      name: 'Telegram chat',
      apiKey: '123456:ABC',
      chatId: '-701234567',
      payload: 'test',
    })

    expect(channel.synthesize()).toMatchObject({
      config: {
        template: 'chat_id=-701234567&parse_mode=HTML&text=test',
      },
    })
  })
})
