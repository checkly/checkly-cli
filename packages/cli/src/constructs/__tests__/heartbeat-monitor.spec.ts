import { describe, it, expect, beforeEach } from 'vitest'

import { HeartbeatMonitor } from '../index'
import { Project, Session } from '../project'
import { Diagnostics } from '../diagnostics'

describe('HeartbeatMonitor', () => {
  describe('validation', () => {
    beforeEach(() => {
      Session.project = new Project('validation-test-project', {
        name: 'Validation Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
    })

    it('should validate period bounds - too low', async () => {
      const heartbeat = new HeartbeatMonitor('test-heartbeat', {
        name: 'Test Heartbeat',
        period: 10,
        periodUnit: 'seconds',
        grace: 5,
        graceUnit: 'seconds'
      })

      const diagnostics = new Diagnostics()
      await heartbeat.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Period must be at least 30 seconds')
          })
        ])
      )
    })

    it('should validate period bounds - too high', async () => {
      const heartbeat = new HeartbeatMonitor('test-heartbeat', {
        name: 'Test Heartbeat',
        period: 400,
        periodUnit: 'days',
        grace: 5,
        graceUnit: 'seconds'
      })

      const diagnostics = new Diagnostics()
      await heartbeat.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Period must not exceed 365 days')
          })
        ])
      )
    })

    it('should validate grace bounds - too high', async () => {
      const heartbeat = new HeartbeatMonitor('test-heartbeat', {
        name: 'Test Heartbeat',
        period: 60,
        periodUnit: 'seconds',
        grace: 400,
        graceUnit: 'days'
      })

      const diagnostics = new Diagnostics()
      await heartbeat.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Grace period must not exceed 365 days')
          })
        ])
      )
    })

    it('should validate grace bounds - negative', async () => {
      const heartbeat = new HeartbeatMonitor('test-heartbeat', {
        name: 'Test Heartbeat',
        period: 60,
        periodUnit: 'seconds',
        grace: -10,
        graceUnit: 'seconds'
      })

      const diagnostics = new Diagnostics()
      await heartbeat.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Grace period must be 0 or greater')
          })
        ])
      )
    })

    it('should validate time units', async () => {
      const heartbeat = new HeartbeatMonitor('test-heartbeat', {
        name: 'Test Heartbeat',
        period: 60,
        periodUnit: 'invalid' as any,
        grace: 30,
        graceUnit: 'also-invalid' as any
      })

      const diagnostics = new Diagnostics()
      await heartbeat.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Invalid time unit "invalid"')
          }),
          expect.objectContaining({
            message: expect.stringContaining('Invalid time unit "also-invalid"')
          })
        ])
      )
    })

    it('should accept valid configuration', async () => {
      const heartbeat = new HeartbeatMonitor('test-heartbeat', {
        name: 'Test Heartbeat',
        period: 5,
        periodUnit: 'minutes',
        grace: 30,
        graceUnit: 'seconds'
      })

      const diagnostics = new Diagnostics()
      await heartbeat.validate(diagnostics)

      expect(diagnostics.isFatal()).toBe(false)
    })
  })
})
