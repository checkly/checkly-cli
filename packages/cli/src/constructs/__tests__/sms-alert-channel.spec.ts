import { describe, it, expect, beforeEach } from 'vitest'

import { SmsAlertChannel } from '../index'
import { Project, Session } from '../project'
import { Diagnostics } from '../diagnostics'

describe('SmsAlertChannel', () => {
  describe('validation', () => {
    beforeEach(() => {
      Session.project = new Project('validation-test-project', {
        name: 'Validation Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
    })

    it('should validate phone number format', async () => {
      const smsChannel = new SmsAlertChannel('test-sms', {
        phoneNumber: '1234567890'
      })

      const diagnostics = new Diagnostics()
      await smsChannel.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Must be in E.164 format')
          })
        ])
      )
    })

    it('should validate various invalid phone number formats', async () => {
      const invalidPhones = [
        '1234567890',      // Missing +
        '+0123456789',     // Starts with 0
        '+abc123456789',   // Contains letters
        '++1234567890',    // Double +
        '+1',              // Too short
        '+' + '1'.repeat(20) // Too long
      ]

      for (const phone of invalidPhones) {
        const smsChannel = new SmsAlertChannel(`test-sms-${phone.replace(/[^a-zA-Z0-9]/g, '-')}`, {
          phoneNumber: phone
        })

        const diagnostics = new Diagnostics()
        await smsChannel.validate(diagnostics)

        expect(diagnostics.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('Must be in E.164 format')
            })
          ])
        )
      }
    })

    it('should accept valid E.164 phone numbers', async () => {
      const validPhones = [
        '+1234567890',
        '+441234567890',
        '+33123456789',
        '+81234567890'
      ]

      for (const phone of validPhones) {
        const smsChannel = new SmsAlertChannel(`test-sms-${phone.replace(/[^a-zA-Z0-9]/g, '-')}`, {
          phoneNumber: phone
        })

        const diagnostics = new Diagnostics()
        await smsChannel.validate(diagnostics)

        expect(diagnostics.isFatal()).toBe(false)
      }
    })
  })
})
