import { describe, it, expect, beforeEach } from 'vitest'

import { EmailAlertChannel } from '../index'
import { Project, Session } from '../project'
import { Diagnostics } from '../diagnostics'

describe('EmailAlertChannel', () => {
  describe('validation', () => {
    beforeEach(() => {
      Session.project = new Project('validation-test-project', {
        name: 'Validation Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
    })

    it('should validate email address format', async () => {
      const emailChannel = new EmailAlertChannel('test-email', {
        address: 'invalid-email'
      })

      const diagnostics = new Diagnostics()
      await emailChannel.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Must contain @ symbol')
          })
        ])
      )
    })

    it('should validate various invalid email formats', async () => {
      const invalidEmails = [
        'plainaddress',
        '',
        'no-at-symbol.com'
      ]

      for (const [i, email] of invalidEmails.entries()) {
        const emailChannel = new EmailAlertChannel(`test-email-invalid-${i}`, {
          address: email
        })

        const diagnostics = new Diagnostics()
        await emailChannel.validate(diagnostics)

        expect(diagnostics.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('Must contain @ symbol')
            })
          ])
        )
      }
    })

    it('should accept valid email addresses', async () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user123@example-domain.org'
      ]

      for (const email of validEmails) {
        const emailChannel = new EmailAlertChannel(`test-email-${email.replace(/[^a-zA-Z0-9]/g, '-')}`, {
          address: email
        })

        const diagnostics = new Diagnostics()
        await emailChannel.validate(diagnostics)

        expect(diagnostics.isFatal()).toBe(false)
      }
    })
  })
})
