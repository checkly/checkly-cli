import { BrowserCheck } from '../index'
import { Project, Session } from '../project'
import * as path from 'path'

describe('BrowserCheck', () => {
  it('should correctly load file dependencies', () => {
    Session.basePath = __dirname
    const bundle = BrowserCheck.bundle(path.join(__dirname, 'fixtures', 'browser-check', 'entrypoint.js'))
    delete Session.basePath

    expect(bundle).toEqual({
      script: 'require("./dep1")\nrequire("./dep2")\n',
      scriptPath: 'fixtures/browser-check/entrypoint.js',
      dependencies: [
        {
          path: 'fixtures/browser-check/dep1.js',
          content: 'module.exports = "dependency 1"\n',
        },
        {
          path: 'fixtures/browser-check/dep2.js',
          content: 'module.exports = "dependency 2"\n',
        },
      ],
    })
  })

  it('should apply default check settings', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const browserCheck = new BrowserCheck('test-check', {
      name: 'Test Check',
      code: { content: 'console.log("test check")' },
    })
    delete Session.checkDefaults
    expect(browserCheck).toMatchObject({ tags: ['default tags'] })
  })

  it('should overwrite default check settings with check-specific config', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const browserCheck = new BrowserCheck('test-check', {
      name: 'Test Check',
      tags: ['test check'],
      code: { content: 'console.log("test check")' },
    })
    delete Session.checkDefaults
    expect(browserCheck).toMatchObject({ tags: ['test check'] })
  })

  it('should apply browser check defaults instead of generic check defaults', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['check default'] }
    Session.browserCheckDefaults = { tags: ['browser check default'] }
    const browserCheck = new BrowserCheck('test-check', {
      name: 'Test Check',
      code: { content: 'console.log("test check")' },
    })
    delete Session.checkDefaults
    delete Session.browserCheckDefaults
    expect(browserCheck).toMatchObject({ tags: ['browser check default'] })
  })
})
