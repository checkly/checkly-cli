import { describe, it, expect, afterEach, beforeEach } from 'vitest'

import { SlackAppAlertChannel } from '../index.js'
import { Diagnostics } from '../diagnostics.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

const validate = async (slackChannels: string[]) => {
  const diagnostics = new Diagnostics()
  await new SlackAppAlertChannel('ops-slack', { slackChannels }).validate(diagnostics)
  return diagnostics
}

describe('SlackAppAlertChannel', () => {
  beforeEach(() => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.accountId = 'acc-1'
  })

  afterEach(() => {
    Session.accountId = undefined
    Session.accountConnectedIntegrations = undefined
  })

  it('refuses the channel when the account has no Checkly Slack app', async () => {
    Session.accountConnectedIntegrations = []

    const diagnostics = await validate(['#ops'])

    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual([
      expect.objectContaining({
        title: 'Checkly Slack app not connected',
        message: expect.stringContaining(
          `SlackAppAlertChannel 'ops-slack' needs the Checkly Slack app, which is not connected to this account, so its alerts cannot be delivered.`,
        ),
      }),
    ])
    expect(diagnostics.observations[0].message).toContain(
      'https://app.checklyhq.com/accounts/acc-1/settings/account/integrations',
    )
  })

  it('accepts the channel when the Checkly Slack app is connected', async () => {
    Session.accountConnectedIntegrations = ['SLACK']

    const diagnostics = await validate(['#ops'])

    expect(diagnostics.isFatal()).toBe(false)
  })

  it('skips the check when the API does not report connected integrations', async () => {
    Session.accountConnectedIntegrations = undefined

    const diagnostics = await validate(['#ops'])

    expect(diagnostics.isFatal()).toBe(false)
  })

  it('accepts a channel without Slack destinations, which needs no Slack app', async () => {
    Session.accountConnectedIntegrations = []

    const diagnostics = await validate([])

    expect(diagnostics.isFatal()).toBe(false)
  })
})
