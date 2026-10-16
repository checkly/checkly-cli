import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { Dashboard } from '../index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { Bundler } from '../../services/check-parser/bundler.js'

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

  describe('synthesize', () => {
    it('sends the cleared value of every text property the construct leaves unset', async () => {
      Session.project = new Project('project-id', { name: 'Test Project' })
      const dashboard = new Dashboard('test-dashboard', { customUrl: 'my-status' })
      const bundler = await Bundler.create({ cacheHash: 'foo' })
      const bundle = await dashboard.bundle(bundler)
      expect(bundle.synthesize()).toMatchObject({
        customUrl: 'my-status',
        customDomain: null,
        logo: '',
        favicon: null,
        link: null,
        header: '',
        description: null,
      })
    })

    it('sends a null custom URL beside a custom domain', async () => {
      Session.project = new Project('project-id', { name: 'Test Project' })
      const dashboard = new Dashboard('test-dashboard', { customDomain: 'status.example.com', header: 'Status' })
      const bundler = await Bundler.create({ cacheHash: 'foo' })
      const bundle = await dashboard.bundle(bundler)
      expect(bundle.synthesize()).toMatchObject({
        customUrl: null,
        customDomain: 'status.example.com',
        header: 'Status',
      })
    })
  })
})
