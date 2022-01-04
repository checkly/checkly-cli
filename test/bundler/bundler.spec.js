const bundle = require('../../src/parser/bundler')
const assert = require('assert')

const fixtureBundle = require('../fixtures/scripts/bundles')

describe('bundler', () => {
  it('bundles ES modules from check inline JS script', async () => {
    const [result] = await bundle({
      script: `import axios from 'axios'
console.log(axios)
`
    })

    assert.equal(result.code, "import axios from 'axios';\n\nconsole.log(axios);\n")
    assert.deepEqual(result.imports, ['axios'])
  })

  it('bundles ES modules from check inline JS script', async () => {
    const [result] = await bundle({
      path: './test/fixtures/scripts/main.js'
    })

    assert.equal(result.code, fixtureBundle.js)
    assert.deepEqual(result.imports, ['path', 'axios'])
  })

  it('bundles ES modules from check inline TS script', async () => {
    const [result] = await bundle({
      path: './test/fixtures/scripts/main.ts'
    })

    assert.equal(result.code, fixtureBundle.ts)
  }).timeout(3500)

  it('throws error when check path is invalid', async () => {
    const path = 'does-not-exist.js'
    try {
      await bundle({ path })
    } catch (e) {
      assert.equal(e.message, `Could not resolve entry module (${path}).`)
    }
  })

  it('throws error when check does not have script and path', async () => {
    try {
      await bundle({})
    } catch (e) {
      assert.equal(e.message, 'Missing script or path properties in check.')
    }
  })

  it('throws error when using a not allowed external module', async () => {
    const module = 'vue'
    try {
      await bundle({
        script: `import ${module} from '${module}'`
      })
    } catch (e) {
      assert.equal(e.message, `Invalid import of ${module} package in check script.`)
    }
  })

  it('throws error when using invalid JS syntax', async () => {
    try {
      await bundle({
        script: '@'
      })
    } catch (e) {
      assert.equal(e.message, 'Unexpected character \'@\' (Note that you need plugins to import files that are not JavaScript)')
    }
  })
})
