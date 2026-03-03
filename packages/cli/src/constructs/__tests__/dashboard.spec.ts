import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { Dashboard } from '../index'
import { Project, Session } from '../project'
import { Bundler } from '../../services/check-parser/bundler'

describe('Dashboard', () => {
  describe('customCSS', () => {
    it(`should synthesize 'entrypoint'`, async () => {
      const getFilePath = (filename: string) => path.join(__dirname, 'fixtures', 'dashboard', filename)
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
      const dashboard = new Dashboard('test-dashboard', {
        customCSS: {
          entrypoint: getFilePath('custom.css'),
        },
      })
      const bundler = await Bundler.create({
        cacheHash: 'foo',
      })
      const bundle = await dashboard.bundle(bundler)
      expect(bundle.synthesize()).toMatchObject({
        customCSS: '/* legit CSS */',
      })
    })

    it(`should synthesize 'content'`, async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
      const dashboard = new Dashboard('test-dashboard', {
        customCSS: {
          content: 'foo',
        },
      })
      const bundler = await Bundler.create({
        cacheHash: 'foo',
      })
      const bundle = await dashboard.bundle(bundler)
      expect(bundle.synthesize()).toMatchObject({
        customCSS: 'foo',
      })
    })
  })
})
