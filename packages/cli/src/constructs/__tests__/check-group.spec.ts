import { describe, it, expect } from 'vitest'

import { AlertEscalationBuilder, CheckGroup, CheckGroupV1, CheckGroupV2 } from '../index'
import { Project, Session } from '../project'

describe('CheckGroup', () => {
  describe('v1', () => {
    it('should equal CheckGroup for backwards compat', () => {
      expect(CheckGroupV1).toBe(CheckGroup)
    })

    it('should throw if the same logicalId is used twice', () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const add = () => {
        new CheckGroupV1('foo', {
          name: 'Test',
        })
      }

      expect(add).not.toThrow()
      expect(add).toThrow('already exists')
    })

    it('should not throw if the same fromId() is used twice', () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const add = () => {
        CheckGroupV1.fromId(123)
      }

      expect(add).not.toThrow()
      expect(add).not.toThrow()
    })

    it('should not synthesize virtual v property', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const group = new CheckGroupV1('foo', {
        name: 'Test',
      })

      const bundle = await group.bundle()
      const payload = bundle.synthesize()

      expect(payload.v).toBeUndefined()
    })
  })

  describe('v2', () => {
    it('should throw if the same logicalId is used twice', () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const add = () => {
        new CheckGroupV2('foo', {
          name: 'Test',
        })
      }

      expect(add).not.toThrow()
      expect(add).toThrow('already exists')
    })

    it('should not throw if the same fromId() is used twice', () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const add = () => {
        CheckGroupV2.fromId(123)
      }

      expect(add).not.toThrow()
      expect(add).not.toThrow()
    })

    it('should synthesize virtual v: 2 property', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const group = new CheckGroupV2('foo', {
        name: 'Test',
      })

      const bundle = await group.bundle()
      const payload = bundle.synthesize()

      expect(payload.v).toEqual(2)
    })

    it('should synthesize global alertEscalationPolicy', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const group = new CheckGroupV2('foo', {
        name: 'Test',
        alertEscalationPolicy: 'global',
      })

      const bundle = await group.bundle()
      const payload = bundle.synthesize()

      expect(payload.useGlobalAlertSettings).toEqual(true)
      expect(payload.alertSettings).toBeUndefined()
    })

    it('should synthesize undefined alertEscalationPolicy', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const group = new CheckGroupV2('foo', {
        name: 'Test',
      })

      const bundle = await group.bundle()
      const payload = bundle.synthesize()

      expect(payload.useGlobalAlertSettings).toBeUndefined()
      expect(payload.alertSettings).toBeUndefined()
    })

    it('should synthesize actual alertEscalationPolicy', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const group = new CheckGroupV2('foo', {
        name: 'Test',
        alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1),
      })

      const bundle = await group.bundle()
      const payload = bundle.synthesize()

      expect(payload.useGlobalAlertSettings).toEqual(false)
      expect(payload.alertSettings).toEqual(expect.objectContaining({
        escalationType: 'RUN_BASED',
      }))
    })
  })
})
