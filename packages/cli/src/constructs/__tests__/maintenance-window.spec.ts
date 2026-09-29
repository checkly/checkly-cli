import { beforeEach, describe, expect, it } from 'vitest'

import { Diagnostics, KNOWN_TIME_ZONES, MaintenanceWindow, MaintenanceWindowProps } from '../index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

const baseProps: MaintenanceWindowProps = {
  name: 'Weekly database maintenance',
  tags: ['database'],
  startsAt: new Date('2030-01-01T09:00:00.000Z'),
  endsAt: new Date('2030-01-01T10:00:00.000Z'),
  repeatInterval: 1,
  repeatUnit: 'WEEK',
}

async function validate (props: MaintenanceWindowProps): Promise<Diagnostics> {
  const window = new MaintenanceWindow('maintenance-window', props)
  const diagnostics = new Diagnostics()
  await window.validate(diagnostics)
  return diagnostics
}

describe('MaintenanceWindow', () => {
  beforeEach(() => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
  })

  describe('synthesize', () => {
    it('sends a null timezone when none is set, so a removed timezone resets to UTC', () => {
      const window = new MaintenanceWindow('maintenance-window', baseProps)
      expect(window.synthesize()).toHaveProperty('timezone', null)
    })

    it('sends the configured timezone', () => {
      const window = new MaintenanceWindow('maintenance-window', { ...baseProps, timezone: 'Europe/Berlin' })
      expect(window.synthesize()).toHaveProperty('timezone', 'Europe/Berlin')
    })

    it('sends the pause and silence scope', () => {
      const window = new MaintenanceWindow('maintenance-window', {
        ...baseProps,
        tags: undefined,
        pauseAllChecks: true,
        silenceAlertsTags: ['api'],
        silenceAllAlerts: false,
      })
      expect(window.synthesize()).toMatchObject({
        pauseAllChecks: true,
        silenceAlertsTags: ['api'],
        silenceAllAlerts: false,
      })
    })
  })

  describe('validate', () => {
    it.each(['America/New_York', 'UTC', 'Europe/Kyiv', 'Asia/Calcutta', 'Etc/GMT+0', 'Etc/GMT-0'])('accepts %s', async timezone => {
      const diagnostics = await validate({ ...baseProps, timezone })
      expect(diagnostics.isFatal()).toBe(false)
    })

    it.each(['+05:00', '-0300', 'Etc/GMT+5', 'Etc/GMT-14', 'Not/AZone'])('rejects %s', async timezone => {
      const diagnostics = await validate({ ...baseProps, timezone })
      expect(diagnostics.isFatal()).toBe(true)
      expect(diagnostics.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('"timezone" must be a named IANA time zone'),
        }),
      ]))
    })

    it('does not require a timezone', async () => {
      const diagnostics = await validate(baseProps)
      expect(diagnostics.isFatal()).toBe(false)
    })
  })

  describe('KNOWN_TIME_ZONES', () => {
    // validate() trusts listed names without consulting Intl, so the list itself must be well formed.
    // Whether the running Node recognizes each name is not asserted: older Node releases bundle older
    // tzdata and legitimately lack recently added zones.
    it('is a sorted, duplicate-free list of named zones', () => {
      expect([...KNOWN_TIME_ZONES].sort()).toEqual(KNOWN_TIME_ZONES)
      expect(new Set(KNOWN_TIME_ZONES).size).toBe(KNOWN_TIME_ZONES.length)
      expect(KNOWN_TIME_ZONES).toContain('UTC')
      const malformed = KNOWN_TIME_ZONES.filter(timeZone =>
        timeZone !== 'UTC' && !/^[A-Z][A-Za-z]+(\/[A-Z][A-Za-z0-9_+-]*){1,2}$/.test(timeZone))
      expect(malformed).toEqual([])
    })

    it('contains no names that validate() would reject', async () => {
      const diagnostics = new Diagnostics()
      for (const timezone of KNOWN_TIME_ZONES) {
        await new MaintenanceWindow(`maintenance-window-${timezone}`, { ...baseProps, timezone }).validate(diagnostics)
      }
      expect(diagnostics.isFatal()).toBe(false)
    })
  })
})
