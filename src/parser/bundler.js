const path = require('path')
const rollup = require('rollup')
const commonjs = require('@rollup/plugin-commonjs')
const checklyWhitelist = require('../services/rollup-plugin-checkly-whitelist')

const OUTPUT_DIRECTORY = '../../.checkly/output'

async function bundle(entryFile, writeBundle = false) {
  const inputOptions = {
    input: path.join(process.cwd(), entryFile),
    plugins: [commonjs({ sourceMap: true }), checklyWhitelist()],
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
