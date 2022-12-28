import { BrowserCheck } from '../index'
import { Session } from '../project'
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
})
