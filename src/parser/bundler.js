const path = require('path')
const rollup = require('rollup')
const commonjs = require('@rollup/plugin-commonjs')
const virtual = require('@rollup/plugin-virtual')
const checklyWhitelist = require('../services/rollup-plugin-checkly-whitelist')

const OUTPUT_DIRECTORY = '../../.checkly/output'

async function bundle(check, writeBundle = false) {
  const inputOptions = {
    silent: true,
    onwarn: () => {},
    plugins: [checklyWhitelist({ runtime: check.runtime || '2021.06' })],
  }

  if (check.script) {
    inputOptions.input = 'main'
    inputOptions.plugins.push(virtual({ main: check.script }))
  } else if (check.path) {
    inputOptions.input = path.join(process.cwd(), check.path)
  } else {
    throw new Error('MissingCheckScript')
  }

  const outputOptions = {
    sourcemap: true,
    exports: 'auto',
    dir: path.join(__dirname, OUTPUT_DIRECTORY),
    format: 'es',
  }

  const bundle = await rollup.rollup(inputOptions)
  const { output } = await bundle.generate(outputOptions)

  writeBundle && (await bundle.write(outputOptions))

  await bundle.close()

  return output
}

module.exports = bundle
