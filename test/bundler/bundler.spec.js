const bundle = require('../../src/parser/bundler')
const assert = require('assert')

const fixtureBundle = require('../fixtures/scripts/bundles')

describe.only('bundler', () => {
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
  })

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
})
